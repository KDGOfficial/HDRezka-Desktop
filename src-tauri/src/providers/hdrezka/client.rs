use reqwest::{header, Client, Response};
use std::time::{Duration, Instant};

pub struct RezkaClient {
    client: Client,
}

impl RezkaClient {
    pub fn new() -> Self {
        let mut headers = header::HeaderMap::new();
        headers.insert(
            header::USER_AGENT,
            header::HeaderValue::from_static(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
            ),
        );
        headers.insert(
            header::ACCEPT,
            header::HeaderValue::from_static(
                "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            ),
        );
        headers.insert(
            header::ACCEPT_LANGUAGE,
            header::HeaderValue::from_static("ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7"),
        );

        let client = Client::builder()
            .default_headers(headers)
            .timeout(Duration::from_secs(12))
            .cookie_store(true)
            .build()
            .unwrap_or_else(|_| Client::new());

        RezkaClient { client }
    }

    pub async fn get(&self, url: &str) -> Result<Response, reqwest::Error> {
        self.client.get(url).send().await
    }

    pub async fn post_ajax(&self, url: &str, form_params: &[(&str, &str)]) -> Result<Response, reqwest::Error> {
        self.client
            .post(url)
            .header("X-Requested-With", "XMLHttpRequest")
            .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
            .form(&form_params)
            .send()
            .await
    }

    pub async fn ping(&self, url: &str) -> (bool, Option<i64>) {
        let start = Instant::now();
        match self.client.head(url).timeout(Duration::from_secs(5)).send().await {
            Ok(resp) if resp.status().is_success() || resp.status().is_redirection() => {
                let latency = start.elapsed().as_millis() as i64;
                (true, Some(latency))
            }
            _ => {
                // Try fallback GET with small timeout
                match self.client.get(url).timeout(Duration::from_secs(5)).send().await {
                    Ok(resp) if resp.status().is_success() || resp.status().is_redirection() => {
                        let latency = start.elapsed().as_millis() as i64;
                        (true, Some(latency))
                    }
                    _ => (false, None),
                }
            }
        }
    }
}
