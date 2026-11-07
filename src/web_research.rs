//! Bounded, public HTTPS article reader. Redirect targets are validated and DNS is pinned.
use serde_json::{json, Value};
use std::{
    net::{IpAddr, ToSocketAddrs},
    process::Command,
};

fn public_ip(ip: [u8; 4]) -> bool {
    let [a, b, _, _] = ip;
    !(a == 0
        || a == 10
        || a == 127
        || a >= 224
        || a == 169 && b == 254
        || a == 172 && (16..=31).contains(&b)
        || a == 192 && [168, 0, 2].contains(&b)
        || a == 100 && (64..=127).contains(&b)
        || a == 198 && [18, 19, 51].contains(&b)
        || a == 203 && b == 0)
}
fn article_host(url: &str) -> Result<&str, String> {
    if url.len() > 2000
        || url
            .chars()
            .any(|c| c.is_control() || c.is_whitespace() || c == '\\')
    {
        return Err("Invalid article URL".into());
    }
    let host = url
        .strip_prefix("https://")
        .and_then(|s| s.split(['/', '?', '#']).next())
        .ok_or("HTTPS required")?;
    if !host.contains('.')
        || host.parse::<IpAddr>().is_ok()
        || host
            .split('.')
            .any(|label| label.is_empty() || label.starts_with('-') || label.ends_with('-'))
        || !host
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'.' || c == b'-')
        || host.bytes().all(|c| c.is_ascii_digit() || c == b'.')
        || [
            ".local",
            ".localhost",
            ".internal",
            ".test",
            ".invalid",
            ".example",
            ".home",
            ".lan",
        ]
        .iter()
        .any(|s| host.to_ascii_lowercase().ends_with(s))
    {
        return Err("Invalid article host".into());
    }
    Ok(host)
}
fn redirect_url(url: &str, location: &str) -> Result<String, String> {
    let next = if location.starts_with("https://") {
        location.to_owned()
    } else if location.starts_with('/') && !location.starts_with("//") {
        format!("https://{}{}", article_host(url)?, location)
    } else {
        return Err("Unsupported redirect".into());
    };
    article_host(&next)?;
    Ok(next)
}
pub fn read_article(data: &Value) -> Result<Vec<u8>, String> {
    let mut url = data["url"].as_str().ok_or("Missing URL")?.to_owned();
    for hop in 0..3 {
        let host = article_host(&url)?;
        let addresses: Vec<_> = (host, 443)
            .to_socket_addrs()
            .map_err(|_| "Publisher DNS unavailable")?
            .filter_map(|s| match s.ip() {
                IpAddr::V4(ip) => Some(ip),
                _ => None,
            })
            .collect();
        if addresses.is_empty() || addresses.iter().any(|ip| !public_ip(ip.octets())) {
            return Err("Invalid publisher address".into());
        }
        let pinned = format!("{host}:443:{}", addresses[0]);
        // Disable curl config, proxies and automatic redirects; no cookies or credentials.
        let output = Command::new("curl")
            .args([
                "--disable",
                "--silent",
                "--show-error",
                "--include",
                "--proto",
                "=https",
                "--max-time",
                "6",
                "--max-filesize",
                "1048576",
                "--noproxy",
                "*",
                "--resolve",
                &pinned,
                "--header",
                "Accept: text/html,application/xhtml+xml",
                &url,
            ])
            .output()
            .map_err(|_| "Article unavailable")?;
        if !output.status.success() || output.stdout.len() > 1064960 {
            return Err("Article unavailable".into());
        }
        let response = String::from_utf8(output.stdout).map_err(|_| "Invalid article encoding")?;
        let (headers, html) = response
            .split_once("\r\n\r\n")
            .ok_or("Invalid article response")?;
        let status = headers
            .lines()
            .next()
            .and_then(|l| l.split_whitespace().nth(1))
            .unwrap_or("");
        let header = |key: &str| {
            headers
                .lines()
                .filter_map(|l| l.split_once(':'))
                .find(|(k, _)| k.eq_ignore_ascii_case(key))
                .map(|(_, v)| v.trim())
        };
        if ["301", "302", "303", "307", "308"].contains(&status) && hop < 2 {
            url = redirect_url(&url, header("location").ok_or("Missing redirect")?)?;
            continue;
        }
        if status != "200"
            || html.len() > 1048576
            || !header("content-type").is_some_and(|t| {
                t.starts_with("text/html") || t.starts_with("application/xhtml+xml")
            })
        {
            return Err("Article unavailable".into());
        }
        return serde_json::to_vec(&json!({"url":url,"html":html}))
            .map_err(|_| "Invalid article".into());
    }
    Err("Too many redirects".into())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_local_urls_before_network() {
        for url in [
            "file:///etc/passwd",
            "http://nasa.gov/",
            "https://127.0.0.1/",
            "https://2130706433/",
            "https://127.1/",
            "https://[::1]/",
            "https://user:pass@nasa.gov/",
            "https://nasa.gov:444/",
            "https://a.LOCAL/",
            "https://nasa.gov\\@127.0.0.1/",
            "https://nasa.gov\n/",
            "https://a..gov/",
        ] {
            assert!(article_host(url).is_err(), "{url}");
        }
        assert_eq!(
            article_host("https://science.nasa.gov/mission/"),
            Ok("science.nasa.gov")
        );
    }
    #[test]
    fn pins_only_public_addresses() {
        for ip in [
            [127, 0, 0, 1],
            [10, 0, 0, 1],
            [169, 254, 1, 1],
            [192, 168, 0, 1],
            [100, 64, 0, 1],
            [172, 16, 0, 1],
            [0, 0, 0, 0],
            [224, 0, 0, 1],
        ] {
            assert!(!public_ip(ip));
        }
        assert!(public_ip([8, 8, 8, 8]));
    }
    #[test]
    fn validates_redirects() {
        assert!(redirect_url("https://nasa.gov/", "http://127.0.0.1/").is_err());
        assert!(redirect_url("https://nasa.gov/", "https://localhost/").is_err());
        assert!(redirect_url("https://nasa.gov/", "//127.0.0.1/").is_err());
        assert_eq!(
            redirect_url("https://nasa.gov/a", "/mission"),
            Ok("https://nasa.gov/mission".into())
        );
    }
}
