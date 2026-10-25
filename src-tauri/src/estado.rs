//! Estado compartido de OPEN-RVT: solo las preferencias de la aplicación.
//!
//! Copiado del `estado.rs` de PresupuestosPro y reducido a lo genérico: aquí no hay obra
//! abierta, empresa, respaldos ni historial; eso llegará con el modelo en `crates/nucleo`.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard};
use tauri::{AppHandle, Manager};

/// Preferencias de la aplicación tal como viven en `config.json`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Config {
    pub tema: String,
    pub escala_ui: u32,
    pub idioma: String,
    /// Se conserva por compatibilidad con la migración de PresupuestosPro.
    pub idioma_migrado: bool,
    pub barra_compacta: bool,
    pub lateral_expandido: bool,
    pub lateral_ancho_rem: Option<f64>,
    pub color_tema: String,
    pub temas_personalizados: Vec<String>,
    /// Anchos de columna por vista (preferencia de la aplicación, no del modelo).
    pub anchos_columnas: HashMap<String, HashMap<String, u32>>,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            tema: "sistema".into(),
            escala_ui: 120,
            idioma: "es".into(),
            idioma_migrado: true,
            barra_compacta: false,
            lateral_expandido: false,
            lateral_ancho_rem: None,
            color_tema: "verde".into(),
            temas_personalizados: Vec::new(),
            anchos_columnas: HashMap::new(),
        }
    }
}

#[derive(Default)]
pub struct EstadoApp {
    pub config: Mutex<Config>,
}

impl EstadoApp {
    pub fn config(&self) -> MutexGuard<'_, Config> {
        self.config.lock().unwrap_or_else(|e| e.into_inner())
    }
}

/// Rutas de datos de la aplicación.
pub struct Rutas {
    pub datos: PathBuf,
}

impl Rutas {
    pub fn de(app: &AppHandle) -> Result<Rutas, String> {
        // Solo en modo debug (pruebas y capturas): `OPENRVT_DATOS_DIR` redirige la carpeta
        // de datos (config.json y registros) para no tocar los del usuario.
        #[cfg(debug_assertions)]
        if let Ok(dir) = std::env::var("OPENRVT_DATOS_DIR") {
            let dir = dir.trim();
            if !dir.is_empty() {
                let datos = PathBuf::from(dir);
                std::fs::create_dir_all(&datos).map_err(|e| e.to_string())?;
                return Ok(Rutas { datos });
            }
        }
        let datos = app.path().app_data_dir().map_err(|e| e.to_string())?;
        std::fs::create_dir_all(&datos).map_err(|e| e.to_string())?;
        Ok(Rutas { datos })
    }

    pub fn config(&self) -> PathBuf {
        self.datos.join("config.json")
    }
}

/// Lee `config.json`; si no existe o está roto, devuelve la configuración por omisión.
pub fn leer_config(ruta: &std::path::Path) -> Config {
    std::fs::read_to_string(ruta)
        .ok()
        .and_then(|texto| serde_json::from_str(&texto).ok())
        .unwrap_or_default()
}

/// Escribe `config.json` con formato legible.
pub fn guardar_config(ruta: &std::path::Path, config: &Config) -> Result<(), String> {
    let texto = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    std::fs::write(ruta, texto).map_err(|e| e.to_string())
}
