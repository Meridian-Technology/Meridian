# JustGo city directory

`justGoCities500.json.gz` is generated from the GeoNames `cities500.zip` dump
along with `admin1CodesASCII.txt` and `countryInfo.txt`, using
`backend/scripts/buildJustGoCityDirectory.py`. GeoNames data is licensed
under CC BY 4.0: https://www.geonames.org/export/ . Attribute GeoNames in
the city picker and keep this notice when updating the data.

The generator also writes letter shards for search and a compact binary
coordinate index for map taps. The backend loads only a relevant shard, so
the global directory does not have to live in process memory.

Rows contain GeoNames ID, name, ASCII name, country code, admin1 code,
latitude, longitude, population, region name, and country name. Refresh the source periodically; the
directory is for city selection and demand grouping, not event geocoding.
