/// Breath routing matrix — maps CC2 to multiple synthesis destinations.
///
/// A single breath stream simultaneously controls amplitude, filter cutoff,
/// harmonic drive, and other parameters with independent scaling and curves.
/// This is what makes wind synthesis feel alive.
///
/// # Amendment 3
/// `BreathOutput` includes `filter_needs_interpolation` to signal whether the
/// filter's coefficient update must be interpolated across the current block.
use super::breath_curve::{apply_curve, BreathCurve};

/// Maximum number of simultaneous routing entries.
const MAX_ROUTES: usize = 8;

/// Parameters defaulting the three always-created routes.
const DEFAULT_AMP_AMOUNT: f32 = 1.0;
const DEFAULT_FILTER_AMOUNT: f32 = 0.6;
const DEFAULT_DRIVE_AMOUNT: f32 = 0.3;

/// The synthesis parameter that a breath route feeds into.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BreathDestination {
    /// Direct amplitude control — most important, gives dynamic range.
    Amplitude,
    /// Filter cutoff — opens/closes with breath.
    FilterCutoff,
    /// Harmonic exciter / soft saturation — adds overtones at high breath.
    HarmonicDrive,
    /// Filter resonance — adds edge at high pressure.
    FilterResonance,
    /// LFO / vibrato depth.
    VibratoDepth,
    /// Subtle pitch rise with pressure (like a real reed).
    PitchBend,
    /// Breath noise component for realism.
    NoiseLevel,
}

/// One routing entry: CC2 → a destination with scaling and response curve.
#[derive(Debug, Clone, Copy)]
pub struct BreathRoute {
    /// Target synthesis parameter.
    pub destination: BreathDestination,
    /// Bipolar scaling factor (−1.0 to +1.0).
    pub amount: f32,
    /// Response curve applied before scaling.
    pub curve: BreathCurve,
    /// Whether this route is currently active.
    pub enabled: bool,
}

/// All destination values produced by one `BreathRouter::process()` call.
#[derive(Debug, Clone, Copy, Default)]
pub struct BreathOutput {
    pub amplitude: f32,
    pub filter_cutoff: f32,
    pub harmonic_drive: f32,
    pub filter_resonance: f32,
    pub vibrato_depth: f32,
    pub pitch_offset: f32,
    pub noise_level: f32,
    /// True when `filter_cutoff` or `filter_resonance` changed by more than
    /// 0.001 since the last call. When true, the voice filter must interpolate
    /// coefficients across the block instead of snapping.
    pub filter_needs_interpolation: bool,
}

/// Breath routing matrix.
///
/// Call `process()` once per sample with the already-smoothed CC2 value
/// (normalized 0.0–1.0).
#[derive(Debug, Clone)]
pub struct BreathRouter {
    pub routes: [BreathRoute; MAX_ROUTES],
    pub route_count: usize,
    /// User-defined lookup table for the `Custom` curve variant.
    pub custom_curve_table: [f32; 128],
    /// CC2 threshold (0.0–1.0). Below this value all outputs are zero.
    /// Stored normalized (divide raw 0–127 threshold by 127).
    threshold: f32,
    /// Hysteresis: must exceed `threshold + hysteresis` to open, must fall
    /// below `threshold - hysteresis` to close (prevents flutter at the edge).
    hysteresis: f32,
    /// Current gate state (true = breath above threshold).
    gate_open: bool,
    /// Previous filter outputs for interpolation detection.
    prev_filter_cutoff: f32,
    prev_filter_resonance: f32,
}

impl Default for BreathRouter {
    fn default() -> Self {
        Self::new()
    }
}

impl BreathRouter {
    /// Create a new router with the three default routes.
    pub fn new() -> Self {
        let mut routes = [BreathRoute {
            destination: BreathDestination::Amplitude,
            amount: 0.0,
            curve: BreathCurve::Linear,
            enabled: false,
        }; MAX_ROUTES];

        // Route 0: CC2 → Amplitude (exponential, always on)
        routes[0] = BreathRoute {
            destination: BreathDestination::Amplitude,
            amount: DEFAULT_AMP_AMOUNT,
            curve: BreathCurve::Exponential,
            enabled: true,
        };
        // Route 1: CC2 → FilterCutoff (exponential, always on)
        routes[1] = BreathRoute {
            destination: BreathDestination::FilterCutoff,
            amount: DEFAULT_FILTER_AMOUNT,
            curve: BreathCurve::Exponential,
            enabled: true,
        };
        // Route 2: CC2 → HarmonicDrive (S-curve, off by default)
        routes[2] = BreathRoute {
            destination: BreathDestination::HarmonicDrive,
            amount: DEFAULT_DRIVE_AMOUNT,
            curve: BreathCurve::SCurve,
            enabled: false,
        };

        Self {
            routes,
            route_count: 3,
            custom_curve_table: [0.0; 128],
            threshold: 5.0 / 127.0,         // CC value 5 on 0–127 scale
            hysteresis: 2.0 / 127.0 * 0.5,  // ±1 CC unit of hysteresis
            gate_open: false,
            prev_filter_cutoff: 0.0,
            prev_filter_resonance: 0.0,
        }
    }

    /// Set the breath threshold from a raw CC value (0–30 range, default 5).
    pub fn set_threshold(&mut self, raw_cc: f32) {
        self.threshold = raw_cc.clamp(0.0, 30.0) / 127.0;
    }

    /// Update or add a route. Overwrites any existing route for the same destination.
    pub fn set_route(&mut self, route: BreathRoute) {
        // Check for existing route with same destination
        for r in self.routes[..self.route_count].iter_mut() {
            if r.destination == route.destination {
                *r = route;
                return;
            }
        }
        if self.route_count < MAX_ROUTES {
            self.routes[self.route_count] = route;
            self.route_count += 1;
        }
    }

    /// Receive a full custom curve table (128 f32 values, 0.0–1.0).
    ///
    /// Called from the UI bridge, NOT from the per-sample audio path.
    pub fn set_custom_curve(&mut self, table: &[f32; 128]) {
        self.custom_curve_table = *table;
    }

    /// Set the amount for the route matching `destination`. No-op if not found.
    pub fn set_route_amount(&mut self, destination: BreathDestination, amount: f32) {
        for route in &mut self.routes[..self.route_count] {
            if route.destination == destination {
                route.amount = amount.clamp(-1.0, 1.0);
                return;
            }
        }
    }

    /// Apply the same curve to all active routes (used by the breath-curve selector).
    pub fn set_all_route_curves(&mut self, curve: BreathCurve) {
        for route in &mut self.routes[..self.route_count] {
            route.curve = curve;
        }
    }

    /// Process one smoothed breath sample and produce all destination values.
    ///
    /// `breath_value` is the pre-smoothed CC2 normalized to 0.0–1.0.
    pub fn process(&mut self, breath_value: f32) -> BreathOutput {
        // Threshold with hysteresis.
        if self.gate_open {
            if breath_value < self.threshold - self.hysteresis {
                self.gate_open = false;
            }
        } else if breath_value > self.threshold + self.hysteresis {
            self.gate_open = true;
        }

        if !self.gate_open {
            let change = (self.prev_filter_cutoff).abs() > 0.001
                || (self.prev_filter_resonance).abs() > 0.001;
            self.prev_filter_cutoff = 0.0;
            self.prev_filter_resonance = 0.0;
            return BreathOutput {
                filter_needs_interpolation: change,
                ..Default::default()
            };
        }

        let mut out = BreathOutput::default();

        for route in &self.routes[..self.route_count] {
            if !route.enabled {
                continue;
            }
            let curved = apply_curve(breath_value, route.curve, &self.custom_curve_table);
            let scaled = curved * route.amount;

            match route.destination {
                BreathDestination::Amplitude => out.amplitude += scaled,
                BreathDestination::FilterCutoff => out.filter_cutoff += scaled,
                BreathDestination::HarmonicDrive => out.harmonic_drive += scaled,
                BreathDestination::FilterResonance => out.filter_resonance += scaled,
                BreathDestination::VibratoDepth => out.vibrato_depth += scaled,
                BreathDestination::PitchBend => out.pitch_offset += scaled,
                BreathDestination::NoiseLevel => out.noise_level += scaled,
            }
        }

        // Clamp outputs to [0, 1] (bipolar routes could sum beyond bounds).
        out.amplitude = out.amplitude.clamp(0.0, 1.0);
        out.filter_cutoff = out.filter_cutoff.clamp(0.0, 1.0);
        out.harmonic_drive = out.harmonic_drive.clamp(0.0, 1.0);
        out.filter_resonance = out.filter_resonance.clamp(0.0, 1.0);
        out.vibrato_depth = out.vibrato_depth.clamp(0.0, 1.0);
        out.noise_level = out.noise_level.clamp(0.0, 1.0);

        // Detect meaningful filter changes (for coefficient interpolation).
        out.filter_needs_interpolation =
            (out.filter_cutoff - self.prev_filter_cutoff).abs() > 0.001
            || (out.filter_resonance - self.prev_filter_resonance).abs() > 0.001;

        self.prev_filter_cutoff = out.filter_cutoff;
        self.prev_filter_resonance = out.filter_resonance;
        out
    }

    /// True when breath is currently above the threshold.
    pub fn gate_open(&self) -> bool {
        self.gate_open
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    /// Below threshold all outputs must be zero.
    #[test]
    fn below_threshold_is_silent() {
        let mut r = BreathRouter::new();
        let out = r.process(0.01); // below default threshold of 5/127 ≈ 0.039
        assert_eq!(out.amplitude, 0.0);
        assert_eq!(out.filter_cutoff, 0.0);
        assert!(!r.gate_open());
    }

    /// Above threshold + hysteresis the gate opens.
    #[test]
    fn above_threshold_opens_gate() {
        let mut r = BreathRouter::new();
        let out = r.process(0.1); // well above 5/127
        assert!(r.gate_open());
        assert!(out.amplitude > 0.0);
    }

    /// Once gate is open, it stays open until below threshold - hysteresis.
    #[test]
    fn threshold_hysteresis() {
        let mut r = BreathRouter::new();
        r.process(0.1); // open gate
        assert!(r.gate_open());
        // Exactly at threshold — should remain open (hysteresis).
        r.process(r.threshold);
        assert!(r.gate_open(), "Gate should stay open at threshold");
        // Now drop well below.
        r.process(0.0);
        assert!(!r.gate_open(), "Gate should close below threshold - hysteresis");
    }

    /// Amplitude-only default config: full breath → amplitude = 1.0.
    #[test]
    fn full_breath_full_amplitude() {
        let mut r = BreathRouter::new();
        // Disable filter route to isolate amplitude
        r.routes[1].enabled = false;
        let out = r.process(1.0);
        assert!(
            (out.amplitude - 1.0).abs() < 0.02,
            "Expected ~1.0 amplitude, got {}",
            out.amplitude
        );
    }

    /// filter_needs_interpolation signals change properly.
    #[test]
    fn filter_interpolation_flag() {
        let mut r = BreathRouter::new();
        r.process(1.0); // first call — establishes prev values
        let out2 = r.process(1.0); // no change
        assert!(!out2.filter_needs_interpolation, "No change should not set flag");

        let out3 = r.process(0.5); // significant change
        assert!(out3.filter_needs_interpolation, "Change should set flag");
    }
}
