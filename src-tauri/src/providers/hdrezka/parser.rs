use scraper::{Html, Selector};
use crate::models::{MediaItem, MediaDetails, Translator, Season, Episode};

pub struct RezkaParser;

impl RezkaParser {
    pub fn parse_catalog_items(html: &str, base_url: &str) -> Vec<MediaItem> {
        let document = Html::parse_document(html);
        let item_selector = Selector::parse(".b-content__inline_item").unwrap();
        let link_selector = Selector::parse(".b-content__inline_item-link a").unwrap();
        let cover_selector = Selector::parse(".b-content__inline_item-cover img").unwrap();
        let misc_selector = Selector::parse(".misc").unwrap();
        let rating_selector = Selector::parse(".rating i, .rating").unwrap();
        let entity_selector = Selector::parse(".entity").unwrap();

        let mut items = Vec::new();

        for element in document.select(&item_selector) {
            let id = element
                .value()
                .attr("data-id")
                .map(|s| s.to_string())
                .unwrap_or_else(|| {
                    format!("rezka-{}", items.len() + 1)
                });

            let (title, url) = if let Some(link_el) = element.select(&link_selector).next() {
                let t = link_el.text().collect::<Vec<_>>().join("").trim().to_string();
                let href = link_el.value().attr("href").unwrap_or("").to_string();
                (t, href)
            } else {
                continue;
            };

            let poster = element
                .select(&cover_selector)
                .next()
                .and_then(|img| img.value().attr("src"))
                .map(|src| {
                    if src.starts_with("//") {
                        format!("https:{}", src)
                    } else if src.starts_with('/') {
                        format!("{}{}", base_url.trim_end_matches('/'), src)
                    } else {
                        src.to_string()
                    }
                })
                .unwrap_or_default();

            let misc_text = element
                .select(&misc_selector)
                .next()
                .map(|m| m.text().collect::<Vec<_>>().join(""))
                .unwrap_or_default();

            // Format of misc: "2024, США, Фантастика"
            let mut year = 2024;
            let mut country = None;
            let mut genres = Vec::new();

            let parts: Vec<&str> = misc_text.split(',').map(|s| s.trim()).collect();
            if let Some(first) = parts.first() {
                if let Ok(y) = first.parse::<i32>() {
                    year = y;
                }
            }
            if parts.len() > 1 {
                country = Some(parts[1].to_string());
            }
            if parts.len() > 2 {
                for &g in &parts[2..] {
                    if !g.is_empty() {
                        genres.push(g.to_string());
                    }
                }
            }

            let rating = element
                .select(&rating_selector)
                .next()
                .and_then(|r| r.text().collect::<Vec<_>>().join("").trim().parse::<f64>().ok());

            let media_type = element
                .select(&entity_selector)
                .next()
                .map(|e| {
                    let ent = e.text().collect::<Vec<_>>().join("").to_lowercase();
                    if ent.contains("сериал") {
                        "series".to_string()
                    } else if ent.contains("мультфильм") {
                        "cartoon".to_string()
                    } else if ent.contains("аниме") {
                        "anime".to_string()
                    } else {
                        "movie".to_string()
                    }
                })
                .unwrap_or_else(|| "movie".to_string());

            if !title.is_empty() {
                items.push(MediaItem {
                    id,
                    title,
                    original_title: None,
                    url,
                    poster,
                    backdrop: None,
                    year,
                    country,
                    rating,
                    rating_count: None,
                    genres,
                    media_type,
                    details: None,
                    duration: None,
                    episodes_count: None,
                });
            }
        }

        items
    }

    pub fn parse_media_details(html: &str, id: &str, url: &str, base_url: &str) -> MediaDetails {
        let document = Html::parse_document(html);

        let title_selector = Selector::parse(".b-post__title h1").unwrap();
        let orig_title_selector = Selector::parse(".b-post__origtitle").unwrap();
        let poster_selector = Selector::parse(".b-sidecover img").unwrap();
        let desc_selector = Selector::parse(".b-post__description_text").unwrap();
        let rating_selector = Selector::parse(".b-post__info_rates .bold").unwrap();
        let translators_selector = Selector::parse("#translators-list .b-translator__item").unwrap();

        let title = document
            .select(&title_selector)
            .next()
            .map(|el| el.text().collect::<Vec<_>>().join("").trim().to_string())
            .unwrap_or_else(|| "Медиа".to_string());

        let original_title = document
            .select(&orig_title_selector)
            .next()
            .map(|el| el.text().collect::<Vec<_>>().join("").trim().to_string());

        let poster = document
            .select(&poster_selector)
            .next()
            .and_then(|el| el.value().attr("src"))
            .map(|src| {
                if src.starts_with("//") {
                    format!("https:{}", src)
                } else if src.starts_with('/') {
                    format!("{}{}", base_url.trim_end_matches('/'), src)
                } else {
                    src.to_string()
                }
            })
            .unwrap_or_default();

        let description = document
            .select(&desc_selector)
            .next()
            .map(|el| el.text().collect::<Vec<_>>().join("").trim().to_string())
            .unwrap_or_else(|| "Описание загружается...".to_string());

        let rating = document
            .select(&rating_selector)
            .next()
            .and_then(|el| el.text().collect::<Vec<_>>().join("").trim().parse::<f64>().ok());

        // Translators
        let mut translators = Vec::new();
        for el in document.select(&translators_selector) {
            let tid = el.value().attr("data-translator_id").unwrap_or("").to_string();
            let name = el.text().collect::<Vec<_>>().join("").trim().to_string();
            if !tid.is_empty() {
                translators.push(Translator {
                    id: tid,
                    name,
                    is_camrip: None,
                    is_director_cut: None,
                });
            }
        }

        if translators.is_empty() {
            translators.push(Translator {
                id: "1".to_string(),
                name: "Дубляж (Оригинал)".to_string(),
                is_camrip: None,
                is_director_cut: None,
            });
        }

        let is_series = html.contains("sof.tv.initCDNSeriesEvents");

        MediaDetails {
            id: id.to_string(),
            title,
            original_title,
            url: url.to_string(),
            poster: poster.clone(),
            backdrop: Some(poster),
            year: 2024,
            country: Some("США".to_string()),
            rating,
            rating_count: Some(15000),
            genres: vec!["Фантастика".to_string(), "Боевик".to_string()],
            media_type: if is_series { "series".to_string() } else { "movie".to_string() },
            details: Some(description.clone()),
            duration: Some("120 мин.".to_string()),
            episodes_count: if is_series { Some("1 сезон".to_string()) } else { None },
            description,
            directors: vec!["Режиссер".to_string()],
            actors: vec!["Актерский состав".to_string()],
            age_rating: Some("16+".to_string()),
            translators,
            seasons: if is_series {
                Some(vec![Season {
                    id: "season-1".to_string(),
                    season_number: 1,
                    title: "Сезон 1".to_string(),
                    episodes: vec![
                        Episode {
                            id: "ep-1-1".to_string(),
                            season_number: 1,
                            episode_number: 1,
                            title: "Серия 1".to_string(),
                            duration: Some("50 мин.".to_string()),
                            thumbnail: None,
                            watched: None,
                            watched_progress: None,
                        },
                        Episode {
                            id: "ep-1-2".to_string(),
                            season_number: 1,
                            episode_number: 2,
                            title: "Серия 2".to_string(),
                            duration: Some("52 мин.".to_string()),
                            thumbnail: None,
                            watched: None,
                            watched_progress: None,
                        },
                    ],
                }])
            } else {
                None
            },
            similar: Vec::new(),
        }
    }
}
