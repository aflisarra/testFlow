"""Export persisted role-tagging items from MongoDB without modifying data."""

from __future__ import annotations

import argparse
import csv
import os
from pathlib import Path
from urllib.parse import quote, unquote, urlsplit

from dotenv import load_dotenv
from pymongo import MongoClient
from pymongo.errors import PyMongoError
from pymongo.read_preferences import SecondaryPreferred

ATLAS_HOSTS = (
    "ac-h4q9gi6-shard-00-00.bgovz8j.mongodb.net:27017",
    "ac-h4q9gi6-shard-00-01.bgovz8j.mongodb.net:27017",
    "ac-h4q9gi6-shard-00-02.bgovz8j.mongodb.net:27017",
)

FIELDS = (
    "database",
    "specHash",
    "itemId",
    "sourceChunkId",
    "headingPath",
    "text",
    "currentRole",
    "roleMethod",
    "reviewed",
    "reviewState",
    "suggestedRole",
    "module",
    "expectedRole",
    "isCorrect",
    "reason",
)


def _direct_uri(original_uri: str, host: str) -> str:
    parsed = urlsplit(original_uri)
    username = quote(unquote(parsed.username or ""), safe="")
    password = quote(unquote(parsed.password or ""), safe="")
    if not username or not password:
        raise RuntimeError("MongoDB credentials are missing from MONGODB_URI")
    return (
        f"mongodb://{username}:{password}@{host}/"
        "?authSource=admin&directConnection=true&tls=true"
        "&serverSelectionTimeoutMS=10000&connectTimeoutMS=10000"
    )


def _connect(uri: str) -> MongoClient:
    errors: list[str] = []
    for host in ATLAS_HOSTS:
        client = MongoClient(
            _direct_uri(uri, host),
            read_preference=SecondaryPreferred(),
        )
        try:
            client.admin.command("ping")
            return client
        except PyMongoError as exc:
            errors.append(f"{host}: {exc.__class__.__name__}")
            client.close()
    raise RuntimeError("Could not connect to an Atlas host (" + ", ".join(errors) + ")")


def _rows(client: MongoClient) -> list[dict[str, object]]:
    projection = {
        "_id": 0,
        "specHash": 1,
        "itemId": 1,
        "sourceChunkId": 1,
        "headingPath": 1,
        "text": 1,
        "role": 1,
        "roleMethod": 1,
        "reviewed": 1,
        "reviewState": 1,
        "suggestedRole": 1,
        "module": 1,
    }
    rows: list[dict[str, object]] = []
    for database_name in client.list_database_names():
        if database_name in {"admin", "config", "local"}:
            continue
        database = client[database_name]
        if "specingestionitems" not in database.list_collection_names():
            continue
        cursor = (
            database["specingestionitems"]
            .find({}, projection)
            .sort([("specHash", 1), ("itemId", 1)])
        )
        for item in cursor:
            rows.append(
                {
                    "database": database_name,
                    "specHash": item.get("specHash", ""),
                    "itemId": item.get("itemId", ""),
                    "sourceChunkId": item.get("sourceChunkId", ""),
                    "headingPath": " > ".join(item.get("headingPath") or []),
                    "text": item.get("text", ""),
                    "currentRole": item.get("role", "UNTAGGED"),
                    "roleMethod": item.get("roleMethod", "none"),
                    "reviewed": bool(item.get("reviewed", False)),
                    "reviewState": item.get("reviewState", "pending"),
                    "suggestedRole": item.get("suggestedRole") or "",
                    "module": item.get("module", "UNTAGGED"),
                    "expectedRole": "",
                    "isCorrect": "",
                    "reason": "",
                }
            )
    return rows


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("role_audit_items.csv"),
        help="Destination CSV path",
    )
    args = parser.parse_args()

    project_root = Path(__file__).resolve().parents[1]
    load_dotenv(project_root.parent / "backend-2026" / ".env")
    uri = os.getenv("MONGODB_URI") or os.getenv("MONGODB_URL")
    if not uri:
        raise RuntimeError("MONGODB_URI or MONGODB_URL is not configured")

    client = _connect(uri)
    try:
        rows = _rows(client)
    finally:
        client.close()

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)

    databases = sorted({str(row["database"]) for row in rows})
    print(f"Exported {len(rows)} items from {', '.join(databases) or 'no matching database'}")
    print(args.output.resolve())


if __name__ == "__main__":
    main()
