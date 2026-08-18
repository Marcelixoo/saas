"""
Shared tenant definitions and synthetic catalog generation for the load
generator. Everything here talks ONLY in terms of the public Fastify
control-plane HTTP contract described in CONTRACT.md section 3 -- no
Go/Meilisearch/Postgres/Redis access of any kind.

Doc counts below are the "full scale" targets from the load-generator brief.
They are multiplied by CATALOG_SCALE (see seed.py) for quick/local runs, but
the 10:3:5:1:2 ratio between tenants is preserved regardless of scale.
"""
import random

# Tenant key -> (org name, plan, full-scale document count, word bank used to
# generate realistic-looking titles/brands/categories for that catalog).
TENANTS = [
    {
        "key": "T1",
        "name": "large-webshop",
        "plan": "PRO",
        "docs": 10000,
        "categories": ["shoes", "jackets", "t-shirts", "jeans", "sneakers", "hats", "bags", "watches"],
        "brands": ["Nike", "Adidas", "Puma", "Reebok", "NewBalance", "Fila", "Vans", "Converse"],
        "adjectives": ["Red", "Blue", "Black", "White", "Classic", "Retro", "Limited", "Pro", "Ultra", "Lite"],
    },
    {
        "key": "T2",
        "name": "medium-webshop",
        "plan": "PRO",
        "docs": 3000,
        "categories": ["mugs", "candles", "notebooks", "planters", "posters", "lamps"],
        "brands": ["HomeCraft", "Artisan", "Cozy", "Nordic", "Studio", "Maker"],
        "adjectives": ["Handmade", "Ceramic", "Wooden", "Minimal", "Vintage", "Modern"],
    },
    {
        "key": "T3",
        "name": "recommendations",
        "plan": "FREE",
        "docs": 5000,
        "categories": ["electronics", "books", "toys", "kitchen", "outdoor", "fitness"],
        "brands": ["Sony", "Logitech", "Anker", "Bosch", "Philips", "Samsung"],
        "adjectives": ["Wireless", "Smart", "Compact", "Portable", "Premium", "Basic"],
    },
    {
        "key": "T4",
        "name": "merchandising",
        "plan": "FREE",
        "docs": 1000,
        "categories": ["banners", "displays", "signage", "packaging"],
        "brands": ["PromoWorks", "DisplayPro", "ShelfEdge", "BrandKit"],
        "adjectives": ["Seasonal", "Endcap", "Custom", "Standard"],
    },
    {
        "key": "T5",
        "name": "analytics",
        "plan": "FREE",
        "docs": 2000,
        "categories": ["dashboards", "reports", "datasets", "widgets"],
        "brands": ["MetricFlow", "InsightHub", "DataLens", "TrendLine"],
        "adjectives": ["Realtime", "Historical", "Aggregated", "Raw"],
    },
]


def tenant_by_key(key: str) -> dict:
    for t in TENANTS:
        if t["key"] == key:
            return t
    raise KeyError(key)


def build_document(tenant: dict, index: int) -> dict:
    """Deterministic-ish synthetic document for a tenant's catalog.

    IDs are deterministic (sku-<key>-<index>) so re-running the seeder against
    an already-seeded org is an idempotent upsert rather than duplicate growth.
    """
    rng = random.Random(f"{tenant['key']}-{index}")
    adjective = rng.choice(tenant["adjectives"])
    brand = rng.choice(tenant["brands"])
    category = rng.choice(tenant["categories"])
    title = f"{adjective} {brand} {category.rstrip('s').capitalize()} {index}"
    return {
        "id": f"sku-{tenant['key'].lower()}-{index}",
        "title": title,
        "brand": brand,
        "category": category,
    }


def sample_query_terms(tenant: dict) -> list:
    """Terms likely to hit the seeded catalog, for realistic search load."""
    return list({*tenant["brands"], *tenant["categories"], *tenant["adjectives"]})
