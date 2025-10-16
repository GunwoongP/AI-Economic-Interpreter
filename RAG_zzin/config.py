from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    EMBEDDER: str = Field(default="tfidf")
    EMBEDDER_MODEL: str = Field(default="all-MiniLM-L6-v2")
    DATA_DIR: str = Field(default="data/index")
    INDEX_NAME: str = Field(default="default")
    CHUNK_SIZE: int = Field(default=800)
    CHUNK_OVERLAP: int = Field(default=120)
    OPENAI_API_KEY: str | None = None
    OPENAI_MODEL: str = Field(default="gpt-4o-mini")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
    )


settings = Settings()

