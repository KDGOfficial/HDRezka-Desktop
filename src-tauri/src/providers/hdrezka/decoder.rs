use base64::{engine::general_purpose::STANDARD, Engine as _};
use crate::models::{StreamQuality, SubtitleTrack};

pub struct RezkaDecoder;

impl RezkaDecoder {
    /// Generates combinations of trash codes and encodes them in base64
    /// matching HDRezka's `clearTrash` obfuscation algorithm.
    fn generate_trash_codes() -> Vec<String> {
        let trash_chars = ['@', '#', '!', '^', '$'];
        let mut codes = Vec::new();

        // 2-character permutations
        for &c1 in &trash_chars {
            for &c2 in &trash_chars {
                let s = format!("{}{}", c1, c2);
                let b64 = STANDARD.encode(s.as_bytes());
                codes.push(b64);
            }
        }

        // 3-character permutations
        for &c1 in &trash_chars {
            for &c2 in &trash_chars {
                for &c3 in &trash_chars {
                    let s = format!("{}{}{}", c1, c2, c3);
                    let b64 = STANDARD.encode(s.as_bytes());
                    codes.push(b64);
                }
            }
        }

        codes
    }

    /// Cleans trash padding and decodes the obfuscated Base64 CDN stream URL string.
    pub fn clear_trash(raw_data: &str) -> Result<String, String> {
        let cleaned_prefix = raw_data.replace("#h", "");
        let parts: Vec<&str> = cleaned_prefix.split("//_//").collect();
        let mut trash_string = parts.join("");

        let trash_codes = Self::generate_trash_codes();
        for code in trash_codes {
            trash_string = trash_string.replace(&code, "");
        }

        // Pad if needed for Base64 decoding
        let rem = trash_string.len() % 4;
        if rem > 0 {
            trash_string.push_str(&"=".repeat(4 - rem));
        }

        let decoded_bytes = STANDARD
            .decode(&trash_string)
            .map_err(|e| format!("Base64 decode error: {}", e))?;

        String::from_utf8(decoded_bytes)
            .map_err(|e| format!("UTF-8 decode error: {}", e))
    }

    /// Parses resolutions from stream URL string:
    /// format: `[360p]https://... or https://...,[720p]https://...`
    pub fn parse_stream_qualities(decoded_str: &str) -> Vec<StreamQuality> {
        let mut qualities = Vec::new();

        for entry in decoded_str.split(',') {
            let entry = entry.trim();
            if entry.is_empty() {
                continue;
            }

            if let (Some(start_bracket), Some(end_bracket)) = (entry.find('['), entry.find(']')) {
                let quality = &entry[start_bracket + 1..end_bracket];
                let rest = &entry[end_bracket + 1..];

                // URLs may be separated by " or "
                let url = if rest.contains(" or ") {
                    rest.split(" or ").last().unwrap_or(rest).trim()
                } else {
                    rest.trim()
                };

                if !url.is_empty() {
                    qualities.push(StreamQuality {
                        quality: quality.to_string(),
                        url: url.to_string(),
                    });
                }
            }
        }

        qualities
    }

    /// Parses subtitles string:
    /// format: `[Русский]https://...vtt,[English]https://...vtt`
    pub fn parse_subtitles(subtitle_str: &str) -> Vec<SubtitleTrack> {
        let mut tracks = Vec::new();

        for entry in subtitle_str.split(',') {
            let entry = entry.trim();
            if entry.is_empty() {
                continue;
            }

            if let (Some(start_bracket), Some(end_bracket)) = (entry.find('['), entry.find(']')) {
                let lang = &entry[start_bracket + 1..end_bracket];
                let url = entry[end_bracket + 1..].trim();

                if !url.is_empty() {
                    tracks.push(SubtitleTrack {
                        language: lang.to_string(),
                        url: url.to_string(),
                    });
                }
            }
        }

        tracks
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_stream_qualities() {
        let input = "[360p]https://cdn.example.com/360.mp4 or https://cdn2.example.com/360.mp4,[720p]https://cdn.example.com/720.mp4,[1080p]https://cdn.example.com/1080.mp4";
        let qualities = RezkaDecoder::parse_stream_qualities(input);
        assert_eq!(qualities.len(), 3);
        assert_eq!(qualities[0].quality, "360p");
        assert_eq!(qualities[0].url, "https://cdn2.example.com/360.mp4");
        assert_eq!(qualities[1].quality, "720p");
        assert_eq!(qualities[1].url, "https://cdn.example.com/720.mp4");
        assert_eq!(qualities[2].quality, "1080p");
    }

    #[test]
    fn test_parse_subtitles() {
        let input = "[Русский]https://cdn.example.com/ru.vtt,[English]https://cdn.example.com/en.vtt";
        let subs = RezkaDecoder::parse_subtitles(input);
        assert_eq!(subs.len(), 2);
        assert_eq!(subs[0].language, "Русский");
        assert_eq!(subs[0].url, "https://cdn.example.com/ru.vtt");
        assert_eq!(subs[1].language, "English");
        assert_eq!(subs[1].url, "https://cdn.example.com/en.vtt");
    }

    #[test]
    fn test_clear_trash_simple() {
        // Simple base64 string without trash
        use base64::{engine::general_purpose::STANDARD, Engine as _};
        let original = "[720p]https://stream.example.com/video.m3u8";
        let encoded = STANDARD.encode(original.as_bytes());
        let prefixed = format!("#h{}", encoded);
        let decoded = RezkaDecoder::clear_trash(&prefixed).unwrap();
        assert_eq!(decoded, original);
    }
}
