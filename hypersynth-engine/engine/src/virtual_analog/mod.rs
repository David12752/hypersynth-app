// ════════════════════════════════════════════════════════════════════
// HyperSynth — Virtual Analog DSP Primitives
//
// Core building blocks for Topology-Preserving Transform (TPT) based
// circuit simulation, following the methodology of Vadim Zavalishin's
// "The Art of VA Filter Design" and the u-he Diva architecture.
//
// These primitives are the foundation on which all VA oscillators,
// filters, and effects are built.
// ════════════════════════════════════════════════════════════════════

pub mod nonlinear_solver;
pub mod tpt_integrator;

pub use nonlinear_solver::NonLinearSolver;
pub use tpt_integrator::TptIntegrator;
