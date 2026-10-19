pub trait OscillatorEngine: Send {
    fn process(&mut self, sample_rate: f32) -> f32;
    fn set_frequency(&mut self, freq: f32);
    fn set_param(&mut self, name: &str, value: f32);
    fn reset(&mut self);
    fn name(&self) -> &'static str;
}
