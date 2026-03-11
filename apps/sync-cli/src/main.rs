const HELP: &str = "\
mdit-sync

Standalone sync CLI scaffold for Mdit.

Planned commands:
  init
  push
  pull
  status

The shared runtime boundary is available in the sync-runtime crate.
";

fn main() {
    let mut args = std::env::args().skip(1);
    match args.next().as_deref() {
        None | Some("-h") | Some("--help") => {
            print!("{HELP}");
        }
        Some("-V") | Some("--version") => {
            println!("{}", env!("CARGO_PKG_VERSION"));
        }
        Some(command) => {
            eprintln!(
                "Command `{command}` is not wired yet. Planned commands: init, push, pull, status."
            );
            std::process::exit(2);
        }
    }
}
