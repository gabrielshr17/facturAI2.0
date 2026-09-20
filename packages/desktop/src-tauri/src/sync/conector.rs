// Conector de PowerSync contra Supabase Auth + PostgREST, para la identidad
// fija de sincronización (sync-caja@facturai.internal, ver
// packages/api/.env). Esta identidad es UNA sola compartida por todas las
// cajas del negocio (decisión ya tomada, ver brief de la tarea) — este
// archivo no crea identidades por caja.
//
// `fetch_credentials` resuelve el JWT que PowerSync usa contra su propio
// servicio (POWERSYNC_URL). `upload_data` sube las transacciones CRUD locales
// pendientes a Supabase vía PostgREST directo (no hay backend propio de
// escritura en este proyecto todavía; las políticas RLS de
// packages/api/db/rls-policies.sql son las que autorizan a esta identidad a
// escribir en las tablas sincronizadas). Ver el reporte de la tarea para las
// limitaciones conocidas de este approach (sin batching, sin reintento con
// backoff propio más allá de que PowerSync reintenta la iteración de sync
// completa si upload_data falla).

use std::env;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use async_trait::async_trait;
use powersync::error::PowerSyncError;
use powersync::{BackendConnector, CrudEntry, PowerSyncCredentials, PowerSyncDatabase, SyncOptions, UpdateType};
use reqwest::{Client, StatusCode};
use serde::Deserialize;
use serde_json::{Map, Value};
use tauri::{command, AppHandle, Runtime};
use tauri_plugin_powersync::PowerSyncExt;

#[derive(Debug, thiserror::Error)]
enum ErrorSincronizacion {
    #[error("falta la variable de entorno {0} (ver packages/desktop/.env.example)")]
    FaltaVariable(&'static str),
    #[error("Supabase Auth respondió con estado {0} al pedir credenciales de sincronización")]
    AutenticacionFallida(u16),
    #[error("Supabase Auth no devolvió access_token")]
    SinAccessToken,
    #[error("PostgREST respondió con estado {status} al sincronizar {tabla}: {cuerpo}")]
    EscrituraFallida {
        status: u16,
        tabla: String,
        cuerpo: String,
    },
}

/// Variables de entorno que necesita el conector, leídas en tiempo de
/// ejecución (nunca embebidas en el binario, ver packages/desktop/.env.example).
struct EntornoSincronizacion {
    supabase_url: String,
    supabase_anon_key: String,
    powersync_url: String,
    sync_email: String,
    sync_password: String,
}

impl EntornoSincronizacion {
    fn desde_variables_de_entorno() -> Result<Self, ErrorSincronizacion> {
        fn requerida(nombre: &'static str) -> Result<String, ErrorSincronizacion> {
            match env::var(nombre) {
                Ok(valor) if !valor.trim().is_empty() => Ok(valor),
                _ => Err(ErrorSincronizacion::FaltaVariable(nombre)),
            }
        }

        Ok(Self {
            supabase_url: requerida("SUPABASE_URL")?,
            supabase_anon_key: requerida("SUPABASE_ANON_KEY")?,
            powersync_url: requerida("POWERSYNC_URL")?,
            sync_email: requerida("SYNC_EMAIL")?,
            sync_password: requerida("SYNC_PASSWORD")?,
        })
    }
}

struct TokenEnCache {
    access_token: String,
    vence_en: Instant,
}

#[derive(Deserialize)]
struct RespuestaTokenSupabase {
    access_token: Option<String>,
    #[serde(default)]
    expires_in: Option<u64>,
}

/// Implementa `powersync::BackendConnector` para la app de escritorio.
///
/// Mantiene una referencia clonada a la base de datos PowerSync (necesaria
/// para `upload_data`, que recorre las transacciones CRUD locales) y cachea
/// el JWT de Supabase hasta que esté por vencer.
pub struct ConectorSincronizacionSupabase {
    http: Client,
    entorno: EntornoSincronizacion,
    db: PowerSyncDatabase,
    cache_token: Mutex<Option<TokenEnCache>>,
}

impl ConectorSincronizacionSupabase {
    pub fn nuevo(db: PowerSyncDatabase) -> Result<Self, String> {
        let entorno = EntornoSincronizacion::desde_variables_de_entorno().map_err(|e| e.to_string())?;
        Ok(Self {
            http: Client::new(),
            entorno,
            db,
            cache_token: Mutex::new(None),
        })
    }

    async fn obtener_token(&self) -> Result<String, ErrorSincronizacion> {
        if let Some(cache) = self.cache_token.lock().expect("cache_token envenenado").as_ref() {
            if cache.vence_en > Instant::now() {
                return Ok(cache.access_token.clone());
            }
        }

        let url = format!(
            "{}/auth/v1/token?grant_type=password",
            self.entorno.supabase_url.trim_end_matches('/')
        );

        let respuesta = self
            .http
            .post(url)
            .header("apikey", &self.entorno.supabase_anon_key)
            .json(&serde_json::json!({
                "email": self.entorno.sync_email,
                "password": self.entorno.sync_password,
            }))
            .send()
            .await
            .map_err(|e| ErrorSincronizacion::AutenticacionFallida(e.status().map(|s| s.as_u16()).unwrap_or(0)))?;

        if !respuesta.status().is_success() {
            return Err(ErrorSincronizacion::AutenticacionFallida(respuesta.status().as_u16()));
        }

        let cuerpo: RespuestaTokenSupabase = respuesta
            .json()
            .await
            .map_err(|_| ErrorSincronizacion::SinAccessToken)?;
        let access_token = cuerpo.access_token.ok_or(ErrorSincronizacion::SinAccessToken)?;

        // 60s de margen antes del vencimiento real para no arrancar una
        // sincronización con un token a punto de expirar.
        let vigencia = Duration::from_secs(cuerpo.expires_in.unwrap_or(3600).saturating_sub(60));
        self.cache_token.lock().expect("cache_token envenenado").replace(TokenEnCache {
            access_token: access_token.clone(),
            vence_en: Instant::now() + vigencia,
        });

        Ok(access_token)
    }

    async fn subir_entrada(&self, token: &str, entrada: &CrudEntry) -> Result<(), ErrorSincronizacion> {
        let base = self.entorno.supabase_url.trim_end_matches('/');

        match &entrada.update_type {
            UpdateType::Put | UpdateType::Patch => {
                let mut fila: Map<String, Value> = entrada.data.clone().unwrap_or_default();
                fila.insert("id".to_string(), Value::String(entrada.id.clone()));

                let url = format!("{}/rest/v1/{}", base, entrada.table);
                let respuesta = self
                    .http
                    .post(url)
                    .header("apikey", &self.entorno.supabase_anon_key)
                    .bearer_auth(token)
                    .header("Prefer", "resolution=merge-duplicates,return=minimal")
                    .json(&Value::Object(fila))
                    .send()
                    .await
                    .map_err(|_| ErrorSincronizacion::EscrituraFallida {
                        status: 0,
                        tabla: entrada.table.clone(),
                        cuerpo: "fallo de red".to_string(),
                    })?;

                if !respuesta.status().is_success() {
                    let status = respuesta.status().as_u16();
                    let cuerpo = respuesta.text().await.unwrap_or_default();
                    return Err(ErrorSincronizacion::EscrituraFallida {
                        status,
                        tabla: entrada.table.clone(),
                        cuerpo,
                    });
                }
            }
            UpdateType::Delete => {
                let url = format!("{}/rest/v1/{}?id=eq.{}", base, entrada.table, entrada.id);
                let respuesta = self
                    .http
                    .delete(url)
                    .header("apikey", &self.entorno.supabase_anon_key)
                    .bearer_auth(token)
                    .send()
                    .await
                    .map_err(|_| ErrorSincronizacion::EscrituraFallida {
                        status: 0,
                        tabla: entrada.table.clone(),
                        cuerpo: "fallo de red".to_string(),
                    })?;

                if !respuesta.status().is_success() && respuesta.status() != StatusCode::NOT_FOUND {
                    let status = respuesta.status().as_u16();
                    let cuerpo = respuesta.text().await.unwrap_or_default();
                    return Err(ErrorSincronizacion::EscrituraFallida {
                        status,
                        tabla: entrada.table.clone(),
                        cuerpo,
                    });
                }
            }
        }

        Ok(())
    }
}

#[async_trait]
impl BackendConnector for ConectorSincronizacionSupabase {
    async fn fetch_credentials(&self) -> Result<PowerSyncCredentials, PowerSyncError> {
        let token = self
            .obtener_token()
            .await
            .map_err(PowerSyncError::upload_error)?;

        Ok(PowerSyncCredentials {
            endpoint: self.entorno.powersync_url.clone(),
            token,
        })
    }

    async fn upload_data(&self) -> Result<(), PowerSyncError> {
        let Some(transaccion) = self
            .db
            .next_crud_transaction()
            .await
            .map_err(PowerSyncError::upload_error)?
        else {
            return Ok(());
        };

        let token = self
            .obtener_token()
            .await
            .map_err(PowerSyncError::upload_error)?;

        for entrada in &transaccion.crud {
            self.subir_entrada(&token, entrada)
                .await
                .map_err(PowerSyncError::upload_error)?;
        }

        transaccion.complete().await
    }
}

/// Comando invocado desde JavaScript (ver packages/core/src/sync/powersync.ts)
/// una vez que `PowerSyncTauriDatabase.init()` resolvió. `connect()` de
/// PowerSync solo puede llamarse desde Rust (limitación documentada del SDK
/// alpha de Tauri) — por eso este comando existe.
#[command]
pub async fn iniciar_sincronizacion<R: Runtime>(app: AppHandle<R>, handle: usize) -> Result<(), String> {
    let powersync = app.powersync();
    let db = powersync
        .database_from_javascript_handle(handle)
        .map_err(|e| e.to_string())?;

    let conector = ConectorSincronizacionSupabase::nuevo(db.clone())?;
    let opciones = SyncOptions::new(conector);
    db.connect(opciones).await;

    Ok(())
}
