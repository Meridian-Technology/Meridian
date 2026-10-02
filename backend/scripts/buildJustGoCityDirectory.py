"""Build the bundled JustGo city index from GeoNames cities500.zip.

Usage: python3 buildJustGoCityDirectory.py cities500.zip admin1CodesASCII.txt countryInfo.txt
Source: https://download.geonames.org/export/dump/cities500.zip
GeoNames data is CC BY 4.0; keep the attribution in the picker and repository.
"""

import gzip
import io
import json
import pathlib
import struct
import sys
import unicodedata
import zipfile


def main() -> None:
    source = pathlib.Path(sys.argv[1])
    admin_source = pathlib.Path(sys.argv[2])
    country_source = pathlib.Path(sys.argv[3])
    target = pathlib.Path(__file__).resolve().parents[1] / "data" / "justGoCities500.json.gz"
    regions = {}
    for line in admin_source.read_text(encoding="utf-8").splitlines():
        fields = line.split("\t")
        if len(fields) >= 2:
            regions[fields[0]] = fields[1]
    countries = {}
    for line in country_source.read_text(encoding="utf-8").splitlines():
        if line.startswith("#"):
            continue
        fields = line.split("\t")
        if len(fields) >= 5:
            countries[fields[0]] = fields[4]
    rows = []
    with zipfile.ZipFile(source).open("cities500.txt") as raw:
        for line in io.TextIOWrapper(raw, encoding="utf-8"):
            fields = line.rstrip("\n").split("\t")
            rows.append([
                int(fields[0]),  # GeoNames ID
                fields[1],       # display name
                fields[2],       # ASCII search name
                fields[8],       # country code
                fields[10],      # admin1 code (state/province)
                round(float(fields[4]), 5),
                round(float(fields[5]), 5),
                int(fields[14] or 0),
                regions.get(f"{fields[8]}.{fields[10]}", ""),
                countries.get(fields[8], fields[8]),
            ])
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("wb") as output:
        with gzip.GzipFile(filename="", mode="wb", fileobj=output, mtime=0) as zipped:
            zipped.write(json.dumps(rows, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
    shards = {}
    coordinates = []
    for row in rows:
        prefixes = set()
        for name in (row[1], row[2]):
            ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii").lower()
            first = ascii_name[:1]
            prefixes.add(first if first.isalpha() else "_")
        for prefix in prefixes:
            shards.setdefault(prefix, []).append(row)
        coordinates.append((row[0], row[5], row[6], ord(sorted(prefixes)[0])))
    shard_dir = target.parent / "justGoCityShards"
    shard_dir.mkdir(parents=True, exist_ok=True)
    for prefix, shard_rows in shards.items():
        with (shard_dir / f"{prefix}.json.gz").open("wb") as output:
            with gzip.GzipFile(filename="", mode="wb", fileobj=output, mtime=0) as zipped:
                zipped.write(json.dumps(shard_rows, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
    with (target.parent / "justGoCityCoordinates.bin").open("wb") as output:
        for record in sorted(coordinates):
            output.write(struct.pack("<IffB", *record))
    print(f"Wrote {len(rows)} cities to {target}")


if __name__ == "__main__":
    main()
