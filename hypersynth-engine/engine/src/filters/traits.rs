pub trait FilterModel: Send {
    fn process(&mut self, input: f32, sample_rate: f32) -> f32;
    fn set_cutoff(&mut self, freq: f32, sample_rate: f32);
    fn set_resonance(&mut self, reso: f32);
    fn set_drive(&mut self, drive: f32);
    fn reset(&mut self);
    fn name(&self) -> &'static str;
}
