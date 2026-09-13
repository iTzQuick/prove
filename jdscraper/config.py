"""Caricamento della configurazione di un sito sorgente."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

CONFIG_DIR = Path(__file__).parent / "config"


@dataclass
class SiteConfig:
    source: str
    root: str
    product_url_pattern: str
    sitemap_pattern: Optional[str] = None
    sitemaps: list[str] = field(default_factory=list)
    selectors: dict[str, Any] = field(default_factory=dict)
    delay: float = 2.0
    user_agent: Optional[str] = None

    @classmethod
    def load(cls, name_or_path: str) -> "SiteConfig":
        path = Path(name_or_path)
        if not path.exists():
            path = CONFIG_DIR / f"{name_or_path}.json"
        if not path.exists():
            available = ", ".join(sorted(p.stem for p in CONFIG_DIR.glob("*.json"))) or "nessuna"
            raise FileNotFoundError(
                f"configurazione '{name_or_path}' non trovata (disponibili: {available})"
            )
        data = json.loads(path.read_text(encoding="utf-8"))
        known = {f for f in cls.__dataclass_fields__}
        return cls(**{k: v for k, v in data.items() if k in known})


def available_configs() -> list[str]:
    return sorted(p.stem for p in CONFIG_DIR.glob("*.json"))
