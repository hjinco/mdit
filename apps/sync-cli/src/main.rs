fn main() {
    if let Err(error) = mdit_sync_cli::run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
