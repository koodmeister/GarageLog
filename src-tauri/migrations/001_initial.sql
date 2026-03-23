CREATE TABLE vehicles (
    id INTEGER PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    year INTEGER NOT NULL,
    type TEXT NOT NULL,
    current_odometer INTEGER NOT NULL,
    odometer_updated_at DATETIME NOT NULL,
    archived BOOLEAN NOT NULL DEFAULT 0,
    archived_at DATETIME,
    created_at DATETIME NOT NULL
);

CREATE TABLE maintenance_items (
    id INTEGER PRIMARY KEY NOT NULL,
    vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
    name TEXT NOT NULL,
    interval_months INTEGER,
    interval_km INTEGER,
    notes TEXT,
    created_at DATETIME NOT NULL
);

CREATE TABLE service_records (
    id INTEGER PRIMARY KEY NOT NULL,
    maintenance_item_id INTEGER NOT NULL REFERENCES maintenance_items(id),
    serviced_at DATETIME NOT NULL,
    odometer_at_service INTEGER,
    cost REAL,
    shop TEXT,
    notes TEXT
);

CREATE TABLE odometer_readings (
    id INTEGER PRIMARY KEY NOT NULL,
    vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
    reading INTEGER NOT NULL,
    recorded_at DATETIME NOT NULL
);
