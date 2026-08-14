fn main() {
    println!("cargo:rerun-if-env-changed=CARGO_FEATURE_E2E");
    let e2e_feature_enabled = std::env::var_os("CARGO_FEATURE_E2E").is_some();
    // Tauri discovers capabilities through the build attribute, independently
    // of the config overlay. Keep the WDIO capability out of production ACL
    // generation as well as out of the production config.
    let attributes = if e2e_feature_enabled {
        println!("cargo:rerun-if-changed=capabilities");
        tauri_build::Attributes::new().capabilities_path_pattern("capabilities/**/*.json")
    } else {
        println!("cargo:rerun-if-changed=capabilities/default.json");
        tauri_build::Attributes::new().capabilities_path_pattern("capabilities/default.json")
    };
    tauri_build::try_build(attributes).unwrap();
}
