use std::{env, io, thread, time::Duration};

use crate::{
    auth::run_login,
    cli::{parse_command, Command, HELP},
    config::{config_path, load_config},
    http::HttpApiClient,
    store::KeyringTokenStore,
};

pub fn run() -> Result<(), String> {
    let command = parse_command(env::args().skip(1).collect())?;
    match command {
        Command::Help => {
            print!("{HELP}");
            Ok(())
        }
        Command::Version => {
            println!("{}", env!("CARGO_PKG_VERSION"));
            Ok(())
        }
        Command::Login(command) => {
            let config_path = config_path()?;
            let config = load_config(&config_path)?;
            let auth_api = HttpApiClient::new();
            let token_store = KeyringTokenStore;
            let mut stdout = io::stdout();
            let mut sleeper = |duration: Duration| thread::sleep(duration);
            run_login(
                &command,
                &config_path,
                &config,
                &auth_api,
                &token_store,
                &mut stdout,
                &mut sleeper,
            )
        }
    }
}
