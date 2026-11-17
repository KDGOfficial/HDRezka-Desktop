pub mod hdrezka;

use std::sync::Arc;
use crate::database::Database;
pub use self::hdrezka::HdRezkaProvider;

pub struct ProviderManager {
    pub hdrezka: HdRezkaProvider,
}

impl ProviderManager {
    pub fn new(db: Arc<Database>) -> Self {
        ProviderManager {
            hdrezka: HdRezkaProvider::new(db),
        }
    }
}
