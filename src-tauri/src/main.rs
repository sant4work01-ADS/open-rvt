// OPEN-RVT: adaptado de PresupuestosPro; llama a open_rvt_lib.
// Evita la ventana de consola extra en Windows en modo release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    open_rvt_lib::run()
}
