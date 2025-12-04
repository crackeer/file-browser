use rand::distributions::{Alphanumeric, DistString};
use serde::{Deserialize, Serialize};
use ssh2::DisconnectCode::AuthCancelledByUser;
use ssh2::Session;
use std::net::TcpStream;
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use std::net::SocketAddr;

pub const BUFFER_SIZE: usize = 1024;
pub const AUTH_TYPE_PASSWORD: &str = &"password";

pub fn connect_ssh_session(
    user: &str,
    host: &str,
    port: &str,
    auth_type: &str,
    auth_config: &str,
) -> Result<Session, String> {
    
    let addr: SocketAddr = format!("{}:{}", host, port).parse::<SocketAddr>().map_err(|e| e.to_string())?;
    let connection = TcpStream::connect_timeout(&addr, Duration::from_secs(20));
    if let Err(err) = connection {
        return Err(err.to_string());
    }

    let mut session = Session::new().unwrap();
    session.set_tcp_stream(connection.unwrap());
    if let Err(err) = session.handshake() {
        return Err(format!("handshake error:{}", err.to_string()));
    }
    if let Err(err) = session.auth_methods(user) {
        return Err(format!("auth root error :{}", err.to_string()));
    }

    if AUTH_TYPE_PASSWORD.eq(auth_type) {
        if let Err(err) = session.userauth_password(user, auth_config) {
            return Err(format!(
                "userauth_password error :{},{},{}",
                err.to_string(),
                user,
                auth_config
            ));
        }
    } else if let Err(err) = session.userauth_pubkey_file(user, None, Path::new(&auth_config), None)
    {
        return Err(format!("userauth_pubkey_file error :{}", err.to_string()));
    }

    if !session.authenticated() {
        return Err(String::from("authenticated wrong"));
    }

    Ok(session)
}