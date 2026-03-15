pub const HELP: &str = "\
mdit-sync

Headless sync CLI for Mdit.

Commands:
  login        Start a device authorization flow and store the resulting token.

Environment:
  MDIT_SYNC_AUTH_URL
  MDIT_SYNC_SERVER_URL
";

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Command {
    Help,
    Version,
    Login(LoginCommand),
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct LoginCommand {
    pub print_token: bool,
}

pub fn parse_command(args: Vec<String>) -> Result<Command, String> {
    let mut args = args.into_iter();
    let Some(command) = args.next() else {
        return Ok(Command::Help);
    };

    match command.as_str() {
        "-h" | "--help" => Ok(Command::Help),
        "-V" | "--version" => Ok(Command::Version),
        "login" => Ok(Command::Login(parse_login_command(args)?)),
        other => Err(format!("unknown command `{other}`")),
    }
}

pub fn parse_login_command(args: impl Iterator<Item = String>) -> Result<LoginCommand, String> {
    let mut command = LoginCommand::default();
    let mut args = args.peekable();

    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--print-token" => command.print_token = true,
            "--help" => return Ok(LoginCommand::default()),
            other => return Err(format!("unknown login flag `{other}`")),
        }
    }

    Ok(command)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_command_routes_to_expected_variants() {
        assert_eq!(parse_command(vec![]).unwrap(), Command::Help);
        assert_eq!(
            parse_command(vec!["--help".to_string()]).unwrap(),
            Command::Help
        );
        assert_eq!(
            parse_command(vec!["--version".to_string()]).unwrap(),
            Command::Version
        );
        assert_eq!(
            parse_command(vec!["login".to_string(), "--print-token".to_string()]).unwrap(),
            Command::Login(LoginCommand {
                print_token: true,
                ..LoginCommand::default()
            })
        );
    }

    #[test]
    fn parse_command_rejects_unknown_command() {
        assert_eq!(
            parse_command(vec!["wat".to_string()]),
            Err("unknown command `wat`".to_string())
        );
    }

    #[test]
    fn parse_login_command_validates_flags() {
        assert_eq!(
            parse_login_command(["--auth-url".to_string()].into_iter()),
            Err("unknown login flag `--auth-url`".to_string())
        );
        assert_eq!(
            parse_login_command(["--wat".to_string()].into_iter()),
            Err("unknown login flag `--wat`".to_string())
        );
    }
}
