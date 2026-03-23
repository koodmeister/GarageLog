use chrono::{DateTime, Months, NaiveDate, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, PartialEq)]
pub enum MaintenanceStatus {
    Overdue,
    DueSoon,
    Ok,
    Unknown,
}

/// Parses an ISO 8601 UTC string (e.g. "2024-01-15T10:30:00.000Z") to a NaiveDate.
fn parse_date(s: &str) -> Option<NaiveDate> {
    // Try RFC 3339 / ISO 8601 with timezone
    if let Ok(dt) = s.parse::<DateTime<Utc>>() {
        return Some(dt.date_naive());
    }
    // Fallback: parse as NaiveDateTime with milliseconds pattern
    if let Ok(ndt) =
        chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S%.3fZ")
    {
        return Some(ndt.date());
    }
    None
}

fn status_from_days(days_remaining: i64) -> MaintenanceStatus {
    if days_remaining < 0 {
        MaintenanceStatus::Overdue
    } else if days_remaining <= 30 {
        MaintenanceStatus::DueSoon
    } else {
        MaintenanceStatus::Ok
    }
}

fn status_from_km(km_remaining: i64) -> MaintenanceStatus {
    if km_remaining < 0 {
        MaintenanceStatus::Overdue
    } else if km_remaining <= 500 {
        MaintenanceStatus::DueSoon
    } else {
        MaintenanceStatus::Ok
    }
}

/// Higher rank = worse. Used to pick the worst of two statuses.
fn severity(s: &MaintenanceStatus) -> u8 {
    match s {
        MaintenanceStatus::Overdue => 3,
        MaintenanceStatus::DueSoon => 2,
        MaintenanceStatus::Ok => 1,
        MaintenanceStatus::Unknown => 0,
    }
}

fn worse(a: MaintenanceStatus, b: MaintenanceStatus) -> MaintenanceStatus {
    if severity(&a) >= severity(&b) {
        a
    } else {
        b
    }
}

pub fn compute_status(
    interval_months: Option<i64>,
    interval_km: Option<i64>,
    last_serviced_at: Option<&str>,
    last_odometer_at_service: Option<i64>,
    current_odometer: i64,
    item_created_at: &str,
) -> MaintenanceStatus {
    let today = Utc::now().date_naive();

    // --- Time-based status ---
    let time_status: Option<MaintenanceStatus> = interval_months.map(|months| {
        let baseline_str = last_serviced_at.unwrap_or(item_created_at);
        match parse_date(baseline_str) {
            None => MaintenanceStatus::Unknown,
            Some(baseline_date) => {
                match baseline_date.checked_add_months(Months::new(months as u32)) {
                    None => MaintenanceStatus::Unknown,
                    Some(next_due) => {
                        let days_remaining = (next_due - today).num_days();
                        status_from_days(days_remaining)
                    }
                }
            }
        }
    });

    // --- Km-based status ---
    let km_status: Option<MaintenanceStatus> = interval_km.map(|km_interval| {
        match last_odometer_at_service {
            None => MaintenanceStatus::Unknown,
            Some(baseline_km) => {
                let next_due_km = baseline_km + km_interval;
                let km_remaining = next_due_km - current_odometer;
                status_from_km(km_remaining)
            }
        }
    });

    // --- Combine ---
    match (time_status, km_status) {
        (Some(ts), None) => ts,
        (None, Some(ks)) => ks,
        (Some(ts), Some(ks)) => worse(ts, ks),
        (None, None) => MaintenanceStatus::Unknown,
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -------------------------------------------------------------------------
    // Test 1: No service records, only months interval → uses created_at as baseline
    // -------------------------------------------------------------------------
    #[test]
    fn test_months_only_no_service_uses_created_at() {
        // created_at is 2 months ago; interval is 6 months → still Ok
        let created_at = "2025-09-23T00:00:00.000Z"; // ~6 months before 2026-03-23
        let status = compute_status(
            Some(12), // 12 month interval
            None,
            None, // no service records
            None,
            0,
            created_at,
        );
        // baseline = 2025-09-23, next_due = 2026-09-23, days_remaining ≈ 184 → Ok
        assert_eq!(status, MaintenanceStatus::Ok);
    }

    // -------------------------------------------------------------------------
    // Test 2: Past service record overdue by months
    // -------------------------------------------------------------------------
    #[test]
    fn test_months_overdue() {
        // last service was 13 months ago, interval is 12 months → Overdue
        let last_serviced = "2025-02-01T00:00:00.000Z"; // > 12 months before 2026-03-23
        let status = compute_status(
            Some(12),
            None,
            Some(last_serviced),
            None,
            0,
            "2024-01-01T00:00:00.000Z",
        );
        assert_eq!(status, MaintenanceStatus::Overdue);
    }

    // -------------------------------------------------------------------------
    // Test 3: Due soon by months (within 30 days)
    // -------------------------------------------------------------------------
    #[test]
    fn test_months_due_soon() {
        // last service ~11 months 15 days ago, interval 12 months → due in ~15 days
        let last_serviced = "2025-04-08T00:00:00.000Z"; // 2025-04-08 + 12 months = 2026-04-08 → ~16 days from 2026-03-23
        let status = compute_status(
            Some(12),
            None,
            Some(last_serviced),
            None,
            0,
            "2024-01-01T00:00:00.000Z",
        );
        assert_eq!(status, MaintenanceStatus::DueSoon);
    }

    // -------------------------------------------------------------------------
    // Test 4: Km-based: overdue
    // -------------------------------------------------------------------------
    #[test]
    fn test_km_overdue() {
        let status = compute_status(
            None,
            Some(5000),
            None,
            Some(50_000), // last service at 50k
            56_000,        // current odometer: 6k km since service
            "2024-01-01T00:00:00.000Z",
        );
        // next_due_km = 55_000, current = 56_000 → km_remaining = -1000 → Overdue
        assert_eq!(status, MaintenanceStatus::Overdue);
    }

    // -------------------------------------------------------------------------
    // Test 5: Km-based: unknown (no odometer at service)
    // -------------------------------------------------------------------------
    #[test]
    fn test_km_unknown_no_odometer_at_service() {
        let status = compute_status(
            None,
            Some(5000),
            Some("2025-01-01T00:00:00.000Z"),
            None, // no last_odometer_at_service
            56_000,
            "2024-01-01T00:00:00.000Z",
        );
        assert_eq!(status, MaintenanceStatus::Unknown);
    }

    // -------------------------------------------------------------------------
    // Test 6: Both intervals: months ok, km overdue → returns Overdue
    // -------------------------------------------------------------------------
    #[test]
    fn test_both_intervals_km_overdue_wins() {
        // months: last service 1 month ago, interval 12 months → Ok
        let last_serviced = "2026-02-23T00:00:00.000Z";
        let status = compute_status(
            Some(12),    // months interval → Ok
            Some(5000),  // km interval → Overdue
            Some(last_serviced),
            Some(50_000),
            56_000, // 6k km over interval
            "2024-01-01T00:00:00.000Z",
        );
        assert_eq!(status, MaintenanceStatus::Overdue);
    }
}
