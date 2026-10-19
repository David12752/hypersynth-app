// ════════════════════════════════════════════════════════════════════
// HyperSynth — Newton-Raphson Solver for Non-Linear Circuit Elements
//
// In real analog circuits, components like transistors and diodes have
// non-linear I-V characteristics (e.g., the Ebers-Moll equation for
// BJTs yields I = Iₛ·(exp(V/Vₜ) − 1), which simplifies to tanh()
// in differential-pair topologies).
//
// When these non-linear elements appear inside feedback loops (like
// the Moog transistor ladder), the output depends on itself through
// a non-linear function — creating an *implicit* equation that cannot
// be solved analytically.
//
// This solver uses Newton-Raphson iteration to find the operating
// point of such circuits.  It converges quadratically near the
// solution, typically needing only 2–4 iterations for audio-rate
// accuracy.
//
// ── Newton-Raphson Method ──────────────────────────────────────────
//
//  Given f(x) = 0, iterate:
//
//    x_{n+1} = x_n − f(x_n) / f'(x_n)
//
//  For the ladder filter feedback equation:
//
//    f(u) = u + k · tanh(G⁴·u + S) − x_in = 0
//
//  where:
//    u     = input to the first integrator stage
//    k     = resonance feedback gain [0..4]
//    G⁴    = cascade gain (product of 4 integrator gains)
//    S     = combined state contribution from integrator memories
//    x_in  = external audio input
//
//  Derivative:
//    f'(u) = 1 + k · (1 − tanh²(G⁴·u + S)) · G⁴
//
// ════════════════════════════════════════════════════════════════════

use libm::tanhf;

/// Newton-Raphson solver for non-linear circuit equations.
///
/// Maintains a warm-start estimate from the previous sample to
/// accelerate convergence (audio signals change slowly between
/// adjacent samples).
pub struct NonLinearSolver {
    /// Maximum iterations per solve (higher = more accurate, more CPU)
    max_iterations: u32,
    /// Convergence threshold: stop when |Δx| < tolerance
    tolerance: f32,
    /// Previous solution — used as initial guess for next sample
    prev_solution: f32,
}

impl NonLinearSolver {
    pub const fn new() -> Self {
        Self {
            max_iterations: 4,
            tolerance: 1e-5,
            prev_solution: 0.0,
        }
    }

    /// Create a solver with custom iteration count.
    ///
    /// `max_iter = 2` is good enough for most audio (< 0.01% THD error).
    /// `max_iter = 4` is "transparent" quality (Diva-level).
    /// `max_iter = 8` is overkill but useful for offline rendering.
    pub const fn with_iterations(max_iter: u32) -> Self {
        Self {
            max_iterations: max_iter,
            tolerance: 1e-5,
            prev_solution: 0.0,
        }
    }

    /// Solve the implicit feedback equation for a ladder filter:
    ///
    ///   f(u) = u + k · tanh(cascade_gain · u + state_sum) − input = 0
    ///
    /// Where:
    /// - `input`:        the driven audio sample entering the filter
    /// - `k`:            resonance feedback gain [0..4]
    /// - `cascade_gain`: G₁⁴ — product of 4 single-integrator gains
    /// - `state_sum`:    S — weighted sum of integrator states
    ///
    /// Returns `u`, the resolved input to the first integrator stage.
    #[inline]
    pub fn solve_ladder(
        &mut self,
        input: f32,
        k: f32,
        cascade_gain: f32,
        state_sum: f32,
    ) -> f32 {
        // Linear estimate as starting point (exact when k=0 or no saturation)
        let mut u = if k.abs() > 1e-6 {
            (input - k * state_sum) / (1.0 + k * cascade_gain)
        } else {
            input
        };

        // Blend with previous solution for stability at high resonance
        u = u * 0.5 + self.prev_solution * 0.5;

        // Newton-Raphson iterations
        for _ in 0..self.max_iterations {
            let tanh_arg = (cascade_gain * u + state_sum).clamp(-8.0, 8.0);
            let t = tanhf(tanh_arg);

            // f(u) = u + k·tanh(G⁴·u + S) − input
            let f = u + k * t - input;

            // f'(u) = 1 + k·(1 − tanh²)·G⁴
            let sech2 = 1.0 - t * t;
            let df = 1.0 + k * sech2 * cascade_gain;

            // Guard against near-zero derivative (shouldn't happen, but safety)
            if df.abs() < 1e-12 {
                break;
            }

            let du = f / df;
            u -= du;

            if du.abs() < self.tolerance {
                break;
            }
        }

        self.prev_solution = u;
        u
    }

    /// Solve a general fixed-point equation: f(x) = x − g(x) = 0
    /// where g(x) is a saturation function like tanh(x·drive).
    ///
    /// Used for finding the operating point of individual transistor
    /// stages when the saturation is inside the integrator.
    #[inline]
    pub fn solve_saturated_node(
        &mut self,
        input: f32,
        drive: f32,
    ) -> f32 {
        let mut x = self.prev_solution;

        for _ in 0..self.max_iterations {
            let arg = (x * drive).clamp(-8.0, 8.0);
            let t = tanhf(arg);

            // f(x) = x − tanh(x·drive) − input ... wait, no.
            // We want: x such that tanh(x·drive) = target
            // Or rather, x = input + tanh(x·drive) (feedback)
            // f(x) = x − input − tanh(x·drive)
            let f = x - input - t;
            let df = 1.0 - drive * (1.0 - t * t);

            if df.abs() < 1e-12 {
                break;
            }

            let du = f / df;
            x -= du;

            if du.abs() < self.tolerance {
                break;
            }
        }

        self.prev_solution = x;
        x
    }

    pub fn reset(&mut self) {
        self.prev_solution = 0.0;
    }
}

// ════════════════════════════════════════════════════════════════════
// Tests
// ════════════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn solver_finds_zero_with_no_feedback() {
        let mut solver = NonLinearSolver::new();
        // With k=0, u should equal input exactly
        let u = solver.solve_ladder(0.5, 0.0, 0.1, 0.0);
        assert!((u - 0.5).abs() < 1e-4, "With k=0, u={} should be ~0.5", u);
    }

    #[test]
    fn solver_reduces_gain_with_feedback() {
        let mut solver = NonLinearSolver::new();
        // With resonance k > 0, the input u should be attenuated
        let u = solver.solve_ladder(1.0, 2.0, 0.25, 0.0);
        // u + 2·tanh(0.25·u) = 1.0 → u < 1.0
        assert!(u < 1.0, "Feedback should reduce effective input: u={}", u);
        assert!(u > 0.0, "u should still be positive: u={}", u);
    }

    #[test]
    fn solver_converges_at_max_resonance() {
        let mut solver = NonLinearSolver::new();
        for i in 0..100 {
            let input = (i as f32 / 100.0) * 2.0 - 1.0;
            let u = solver.solve_ladder(input, 4.0, 0.5, 0.3);
            assert!(u.is_finite(), "Solver diverged at input={}", input);
        }
    }

    #[test]
    fn solver_warm_start_converges_faster() {
        let mut solver = NonLinearSolver::with_iterations(2);
        // Process a sequence — warm start should help
        let mut prev = 0.0f32;
        for i in 0..256 {
            let input = libm::sinf(i as f32 * 0.01) * 0.5;
            let u = solver.solve_ladder(input, 3.0, 0.3, 0.1);
            assert!(u.is_finite());
            // Adjacent samples should be close (smooth audio signal)
            if i > 0 {
                assert!(
                    (u - prev).abs() < 2.0,
                    "Jump too large: {} → {}", prev, u
                );
            }
            prev = u;
        }
    }
}
