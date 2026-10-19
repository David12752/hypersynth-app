//! Monophonic note manager for wind controller instruments.
//!
//! Wind instruments are inherently monophonic — one breath, one pitch.
//! This module handles legato transitions (no audible re-trigger when
//! fingering a new note while holding the previous one), last-note priority,
//! and fingered portamento.
//!
//! The `NoteManager` is a global-layer component: exactly one instance lives
//! in `WindControllerProcessor`. It intercepts MIDI NoteOn/Off before they
//! reach the voice allocator and converts them into higher-level `NoteEvent`s.

/// Maximum number of simultaneously-held notes tracked in the stack.
const NOTE_STACK_MAX: usize = 10;

// ============================================================================
// Public types
// ============================================================================

/// How the wind controller handles simultaneous note-presses.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NoteMode {
    /// Standard polyphonic mode — bypass NoteManager, every NoteOn is `NewNote`.
    Poly,
    /// Always re-trigger envelopes, last-note priority.
    Mono,
    /// Only re-trigger on first note; continuing notes produce `LegatoSlide`.
    Legato,
}

/// Outcome of a note-on / note-off event — consumed by the voice manager.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NoteEvent {
    /// New note: envelopes should re-trigger from the beginning.
    NewNote { note: u8, velocity: u8 },
    /// Legato pitch change: only pitch changes, envelopes continue running.
    LegatoSlide { from_note: u8, to_note: u8, velocity: u8 },
    /// All held notes released — begin amplitude release phase.
    AllNotesOff,
}

// ============================================================================
// NoteManager
// ============================================================================

/// Monophonic / legato note manager using last-note priority.
///
/// Internally maintains a fixed-size stack of held MIDI note numbers.
/// The most recently pressed note is always the sounding note. When released,
/// the manager falls back to the next note still held in the stack (if any).
#[derive(Debug, Clone, Copy)]
pub struct NoteManager {
    mode: NoteMode,
    /// Ordered list of currently-held notes. `stack[0]` = oldest, `stack[stack_size-1]` = newest.
    note_stack: [u8; NOTE_STACK_MAX],
    stack_size: usize,
    current_note: Option<u8>,
}

impl NoteManager {
    /// Create a new `NoteManager` in the given mode.
    pub fn new(mode: NoteMode) -> Self {
        Self {
            mode,
            note_stack: [0u8; NOTE_STACK_MAX],
            stack_size: 0,
            current_note: None,
        }
    }

    /// Change operating mode at runtime (e.g. from UI toggle).
    pub fn set_mode(&mut self, mode: NoteMode) {
        self.mode = mode;
        if mode == NoteMode::Poly {
            self.clear();
        }
    }

    /// Returns the currently sounding note (if any).
    pub fn current_note(&self) -> Option<u8> {
        self.current_note
    }

    /// Reset all state (e.g. All-Notes-Off panic).
    pub fn clear(&mut self) {
        self.stack_size = 0;
        self.current_note = None;
    }

    /// Process a NoteOn event and return the synthesizer action to take.
    ///
    /// In `Poly` mode: always returns `NewNote` (legacy poly path).
    /// In `Mono` mode: always returns `NewNote`, envelopes re-trigger every press.
    /// In `Legato` mode: returns `NewNote` on the first press, `LegatoSlide` for
    ///    subsequent presses while notes are already held.
    pub fn process_note_on(&mut self, note: u8, velocity: u8) -> NoteEvent {
        match self.mode {
            NoteMode::Poly => NoteEvent::NewNote { note, velocity },

            NoteMode::Mono => {
                self.push(note);
                let prev = self.current_note;
                self.current_note = Some(note);
                // Mono always re-triggers, but we still provide from_note for
                // portamento processors upstream — they respect PortamentoMode.
                match prev {
                    Some(from) if from != note => NoteEvent::NewNote { note, velocity },
                    _ => NoteEvent::NewNote { note, velocity },
                }
            }

            NoteMode::Legato => {
                let had_notes = self.stack_size > 0;
                let prev = self.current_note;
                self.push(note);
                self.current_note = Some(note);
                if had_notes {
                    NoteEvent::LegatoSlide {
                        from_note: prev.unwrap_or(note),
                        to_note: note,
                        velocity,
                    }
                } else {
                    NoteEvent::NewNote { note, velocity }
                }
            }
        }
    }

    /// Process a NoteOff event.
    ///
    /// Returns:
    /// - `None` if the released note was not the currently playing note (stack
    ///   still has the playing note — no audible change needed).
    /// - `Some(LegatoSlide { .. })` if the released note was the top-of-stack
    ///   and there are still held notes underneath it.
    /// - `Some(AllNotesOff)` if the stack is now empty.
    pub fn process_note_off(&mut self, note: u8) -> Option<NoteEvent> {
        match self.mode {
            NoteMode::Poly => {
                // In poly mode the voice allocator handles things itself.
                // We report AllNotesOff only when the released note was current.
                if self.current_note == Some(note) {
                    self.current_note = None;
                    Some(NoteEvent::AllNotesOff)
                } else {
                    None
                }
            }

            NoteMode::Mono | NoteMode::Legato => {
                let was_playing = self.current_note == Some(note);
                self.remove(note);

                if !was_playing {
                    // Released note was not sounding — no audible change.
                    return None;
                }

                if self.stack_size == 0 {
                    self.current_note = None;
                    Some(NoteEvent::AllNotesOff)
                } else {
                    // Fall back to the most-recently-pressed remaining note.
                    let next = self.note_stack[self.stack_size - 1];
                    let prev = self.current_note.unwrap_or(next);
                    self.current_note = Some(next);
                    Some(NoteEvent::LegatoSlide { from_note: prev, to_note: next, velocity: 64 })
                }
            }
        }
    }

    // ---- internal stack helpers -------------------------------------------

    fn push(&mut self, note: u8) {
        // Remove if already present (avoid duplicates from stuck-note edge cases).
        self.remove(note);
        if self.stack_size < NOTE_STACK_MAX {
            self.note_stack[self.stack_size] = note;
            self.stack_size += 1;
        } else {
            // Stack is full — shift left to drop the oldest entry and append.
            self.note_stack.copy_within(1.., 0);
            self.note_stack[NOTE_STACK_MAX - 1] = note;
            // stack_size stays at NOTE_STACK_MAX.
        }
    }

    fn remove(&mut self, note: u8) {
        for i in 0..self.stack_size {
            if self.note_stack[i] == note {
                // Shift remaining entries left.
                self.note_stack.copy_within((i + 1)..self.stack_size, i);
                self.stack_size -= 1;
                return;
            }
        }
    }
}

// ============================================================================
// Portamento
// ============================================================================

/// How portamento (glide) is applied.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PortamentoMode {
    /// Glide between all notes.
    Always,
    /// Glide only on legato transitions (when a note is pressed while another is held).
    Fingered,
    /// Never glide — instantaneous pitch changes.
    Off,
}

/// Continuous-pitch portamento processor.
///
/// Holds the current pitch in semitones and slides it toward the target over
/// `glide_time_ms` milliseconds. Updated once per sample in the audio loop.
#[derive(Debug, Clone, Copy)]
pub struct PortamentoProcessor {
    /// Current pitch in semitones (may be fractional during glide).
    pub current_pitch: f32,
    /// Target pitch in semitones (MIDI note number, integer when settled).
    target_pitch: f32,
    /// Semitones-per-sample toward the target.
    rate: f32,
    /// True when a glide is in progress.
    active: bool,
    /// Current operating mode.
    pub mode: PortamentoMode,
    /// User-configured glide time (stored for recalculation on new notes).
    glide_time_ms: f32,
    sample_rate: f32,
}

impl PortamentoProcessor {
    pub fn new(sample_rate: f32) -> Self {
        Self {
            current_pitch: 60.0,
            target_pitch: 60.0,
            rate: 0.0,
            active: false,
            mode: PortamentoMode::Fingered,
            glide_time_ms: 80.0,
            sample_rate,
        }
    }

    /// Set glide time in milliseconds (0–2000 ms).
    pub fn set_glide_time(&mut self, ms: f32) {
        self.glide_time_ms = ms.clamp(0.0, 2000.0);
    }

    /// Handle a new `NoteEvent`. Updates target and recalculates rate.
    pub fn handle_note_event(&mut self, event: &NoteEvent) {
        match event {
            NoteEvent::NewNote { note, .. } => {
                let target = *note as f32;
                match self.mode {
                    PortamentoMode::Off | PortamentoMode::Fingered => {
                        // Fingered mode: jump immediately on NewNote.
                        self.current_pitch = target;
                        self.target_pitch = target;
                        self.active = false;
                    }
                    PortamentoMode::Always => {
                        self.start_glide(target);
                    }
                }
            }
            NoteEvent::LegatoSlide { to_note, .. } => {
                let target = *to_note as f32;
                match self.mode {
                    PortamentoMode::Off => {
                        self.current_pitch = target;
                        self.target_pitch = target;
                        self.active = false;
                    }
                    PortamentoMode::Fingered | PortamentoMode::Always => {
                        self.start_glide(target);
                    }
                }
            }
            NoteEvent::AllNotesOff => {
                self.active = false;
            }
        }
    }

    fn start_glide(&mut self, target: f32) {
        self.target_pitch = target;
        let semitone_distance = (target - self.current_pitch).abs().max(1.0);
        if self.glide_time_ms > 0.0 {
            self.rate = semitone_distance / (self.glide_time_ms * 0.001 * self.sample_rate.max(1.0));
            self.active = true;
        } else {
            self.current_pitch = target;
            self.active = false;
        }
    }

    /// Advance one sample. Returns the current (possibly gliding) pitch in semitones.
    #[inline]
    pub fn next(&mut self) -> f32 {
        if self.active {
            let diff = self.target_pitch - self.current_pitch;
            if diff.abs() <= self.rate {
                self.current_pitch = self.target_pitch;
                self.active = false;
            } else {
                self.current_pitch += self.rate * diff.signum();
            }
        }
        self.current_pitch
    }

    /// True when portamento is in motion.
    pub fn is_gliding(&self) -> bool {
        self.active
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    // ---- NoteManager --------------------------------------------------------

    #[test]
    fn poly_mode_always_new_note() {
        let mut m = NoteManager::new(NoteMode::Poly);
        let ev = m.process_note_on(60, 100);
        assert_eq!(ev, NoteEvent::NewNote { note: 60, velocity: 100 });
        let ev2 = m.process_note_on(64, 100);
        assert_eq!(ev2, NoteEvent::NewNote { note: 64, velocity: 100 });
    }

    #[test]
    fn mono_mode_always_new_note() {
        let mut m = NoteManager::new(NoteMode::Mono);
        let ev = m.process_note_on(60, 100);
        assert_eq!(ev, NoteEvent::NewNote { note: 60, velocity: 100 });
        let ev2 = m.process_note_on(64, 100);
        assert_eq!(ev2, NoteEvent::NewNote { note: 64, velocity: 100 });
    }

    #[test]
    fn legato_first_note_is_new_note() {
        let mut m = NoteManager::new(NoteMode::Legato);
        let ev = m.process_note_on(60, 100);
        assert_eq!(ev, NoteEvent::NewNote { note: 60, velocity: 100 });
    }

    #[test]
    fn legato_second_note_is_slide() {
        let mut m = NoteManager::new(NoteMode::Legato);
        m.process_note_on(60, 100);
        let ev = m.process_note_on(64, 90);
        assert_eq!(ev, NoteEvent::LegatoSlide { from_note: 60, to_note: 64, velocity: 90 });
    }

    #[test]
    fn legato_note_off_falls_back_to_held() {
        let mut m = NoteManager::new(NoteMode::Legato);
        m.process_note_on(60, 100); // first note
        m.process_note_on(64, 90);  // hold second note: slide 60→64
        let ev = m.process_note_off(64); // release top
        assert_eq!(
            ev,
            Some(NoteEvent::LegatoSlide { from_note: 64, to_note: 60, velocity: 64 })
        );
    }

    #[test]
    fn note_off_non_playing_note_is_none() {
        let mut m = NoteManager::new(NoteMode::Legato);
        m.process_note_on(60, 100);
        m.process_note_on(64, 90); // 64 is playing now
        let ev = m.process_note_off(60); // release underlying note (not playing)
        assert_eq!(ev, None);
    }

    #[test]
    fn all_notes_off_when_stack_empty() {
        let mut m = NoteManager::new(NoteMode::Legato);
        m.process_note_on(60, 100);
        let ev = m.process_note_off(60);
        assert_eq!(ev, Some(NoteEvent::AllNotesOff));
    }

    #[test]
    fn note_stack_overflow_drops_oldest() {
        let mut m = NoteManager::new(NoteMode::Legato);
        // Push NOTE_STACK_MAX + 1 notes
        for i in 0..(NOTE_STACK_MAX as u8 + 1) {
            m.process_note_on(60 + i, 100);
        }
        // The stack should still be full (not panicked)
        assert_eq!(m.stack_size, NOTE_STACK_MAX);
        // First entry should have been dropped (oldest = note 60)
        assert!(!m.note_stack[..m.stack_size].contains(&60));
    }

    // ---- PortamentoProcessor ------------------------------------------------

    const SR: f32 = 44_100.0;

    #[test]
    fn portamento_off_jumps_immediately() {
        let mut p = PortamentoProcessor::new(SR);
        p.mode = PortamentoMode::Off;
        p.handle_note_event(&NoteEvent::NewNote { note: 60, velocity: 100 });
        p.handle_note_event(&NoteEvent::LegatoSlide { from_note: 60, to_note: 72, velocity: 100 });
        assert!(!p.is_gliding());
        assert_eq!(p.current_pitch, 72.0);
    }

    #[test]
    fn portamento_fingered_jumps_on_new_note_glides_on_legato() {
        let mut p = PortamentoProcessor::new(SR);
        p.mode = PortamentoMode::Fingered;
        p.set_glide_time(100.0);

        // NewNote → should jump
        p.handle_note_event(&NoteEvent::NewNote { note: 60, velocity: 100 });
        assert_eq!(p.current_pitch, 60.0);
        assert!(!p.is_gliding());

        // LegatoSlide → should glide
        p.handle_note_event(&NoteEvent::LegatoSlide { from_note: 60, to_note: 72, velocity: 80 });
        assert!(p.is_gliding());
    }

    #[test]
    fn portamento_converges_to_target() {
        let mut p = PortamentoProcessor::new(SR);
        p.mode = PortamentoMode::Always;
        p.set_glide_time(50.0); // 50 ms glide
        p.current_pitch = 60.0;
        p.handle_note_event(&NoteEvent::NewNote { note: 72, velocity: 100 });

        // After 2× the glide time, portamento must have reached target.
        let samples = (0.1 * SR) as usize; // 100 ms total
        for _ in 0..samples {
            p.next();
        }
        assert_eq!(p.current_pitch, 72.0, "Portamento did not reach target");
        assert!(!p.is_gliding());
    }
}
