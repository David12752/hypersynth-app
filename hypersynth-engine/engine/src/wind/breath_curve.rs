/// Response curve math for breath (CC2) signals.
///
/// All functions map input ∈ [0.0, 1.0] → output ∈ [0.0, 1.0].
/// Use `libm` for transcendentals (no_std compatible).
use libm::{expf, floorf, logf, tanhf};

// Curve shape constants (tuned to musical taste — not arbitrary).
const EXP_K: f32 = 4.0;
const LOG_K: f32 = 4.0;
const S_K: f32 = 3.0;

/// All supported response curve shapes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BreathCurve {
    /// Output equals input — 1:1 mapping.
    Linear,
    /// More resolution at low breath values, aggressive at high breath.
    Exponential,
    /// Quick response, plateaus at the top.
    Logarithmic,
    /// Gentle start and end, fast middle.
    SCurve,
    /// Index into the user-defined 128-point lookup table.
    Custom,
}

/// Apply the selected curve to a normalised input value.
///
/// `input` must be in `[0.0, 1.0]`; the return value is also in `[0.0, 1.0]`.
#[inline]
pub fn apply_curve(input: f32, curve: BreathCurve, custom_table: &[f32; 128]) -> f32 {
    let x = input.clamp(0.0, 1.0);
    match curve {
        BreathCurve::Linear => x,
        BreathCurve::Exponential => exponential(x),
        BreathCurve::Logarithmic => logarithmic(x),
        BreathCurve::SCurve => s_curve(x),
        BreathCurve::Custom => custom_lookup(x, custom_table),
    }
}

// ---- curve implementations -------------------------------------------------

/// `output = (exp(x·k) − 1) / (exp(k) − 1)`
#[inline]
fn exponential(x: f32) -> f32 {
    let denom = expf(EXP_K) - 1.0;
    (expf(x * EXP_K) - 1.0) / denom
}

/// `output = ln(1 + x·(exp(k) − 1)) / k`
#[inline]
fn logarithmic(x: f32) -> f32 {
    let factor = expf(LOG_K) - 1.0;
    logf(1.0 + x * factor) / LOG_K
}

/// `output = 0.5 · (1 + tanh(k·(x − 0.5)) / tanh(k·0.5))`
#[inline]
fn s_curve(x: f32) -> f32 {
    let denom = tanhf(S_K * 0.5);
    0.5 * (1.0 + tanhf(S_K * (x - 0.5)) / denom)
}

/// Linear interpolation over a 128-point user-defined table.
#[inline]
fn custom_lookup(x: f32, table: &[f32; 128]) -> f32 {
    let scaled = x * 127.0;
    let lo = floorf(scaled) as usize;
    let hi = (lo + 1).min(127);
    let frac = scaled - lo as f32;
    table[lo] + frac * (table[hi] - table[lo])
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    fn flat_table(v: f32) -> [f32; 128] {
        [v; 128]
    }

    /// Every curve maps 0 → 0 and 1 → 1 (boundary conditions).
    #[test]
    fn boundary_conditions() {
        let table = flat_table(0.0); // unused for non-Custom
        for curve in [
            BreathCurve::Linear,
            BreathCurve::Exponential,
            BreathCurve::Logarithmic,
            BreathCurve::SCurve,
        ] {
            let at_zero = apply_curve(0.0, curve, &table);
            let at_one = apply_curve(1.0, curve, &table);
            assert!((at_zero).abs() < 1e-5, "{curve:?} at 0 = {at_zero}");
            assert!((at_one - 1.0).abs() < 1e-5, "{curve:?} at 1 = {at_one}");
        }
    }

    /// Exponential must be below linear in the first half (more low-end control).
    #[test]
    fn exponential_below_linear_at_midpoint() {
        let table = flat_table(0.0);
        let exp_mid = apply_curve(0.5, BreathCurve::Exponential, &table);
        let lin_mid = apply_curve(0.5, BreathCurve::Linear, &table);
        assert!(exp_mid < lin_mid, "Exp should be below linear at midpoint");
    }

    /// Logarithmic must be above linear in the first half (quick response).
    #[test]
    fn logarithmic_above_linear_at_midpoint() {
        let table = flat_table(0.0);
        let log_mid = apply_curve(0.5, BreathCurve::Logarithmic, &table);
        let lin_mid = apply_curve(0.5, BreathCurve::Linear, &table);
        assert!(log_mid > lin_mid, "Log should be above linear at midpoint");
    }

    /// S-Curve is symmetric around 0.5 (output at 0.5 ≈ 0.5).
    #[test]
    fn s_curve_symmetric() {
        let table = flat_table(0.0);
        let mid = apply_curve(0.5, BreathCurve::SCurve, &table);
        assert!((mid - 0.5).abs() < 1e-5, "S-curve midpoint = {mid}");
    }

    /// Custom curve with identity table (y = x·127/127) behaves like Linear.
    #[test]
    fn custom_curve_identity_table() {
        let mut table = [0.0f32; 128];
        for (i, v) in table.iter_mut().enumerate() {
            *v = i as f32 / 127.0;
        }
        for x in (0..=10u32).map(|i| i as f32 * 0.1) {
            let x = x.min(1.0);
            let c = apply_curve(x, BreathCurve::Custom, &table);
            let l = apply_curve(x, BreathCurve::Linear, &[0.0; 128]);
            assert!((c - l).abs() < 0.01, "Custom identity at {x}: c={c} l={l}");
        }
    }

    /// Reference values for exponential (k=4).
    /// exp(0.5·4) - 1 / (exp(4) - 1) ≈ 0.1565
    #[test]
    fn exponential_reference_at_half() {
        let table = flat_table(0.0);
        let v = apply_curve(0.5, BreathCurve::Exponential, &table);
        let expected = (expf(2.0) - 1.0) / (expf(4.0) - 1.0);
        assert!((v - expected).abs() < 1e-4, "Exp at 0.5: {v} vs {expected}");
    }
}
