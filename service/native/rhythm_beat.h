#pragma once
// Beat analysis for rhythm sync: onsets (kick / snare / hat), tempo, phase-locked beat grid.
// Portable C++17, no Windows headers. Feed it mono samples from every WASAPI packet
// (NOT the 256-sample snapshot used by the older modes).
#include <algorithm>
#include <array>
#include <cmath>
#include <complex>
#include <cstdint>
#include <vector>
#ifdef BEAT_DEBUG
#include <cstdio>
#endif

namespace rhythm {

// The tracker expects the time of the packet's LAST sample, not capture receipt.
// When a packet timestamp is invalid, continue the last known sample timeline.
inline double beatPacketEndMs(double firstSampleMs, size_t count, double sampleRate, double receivedMs, double previousEndMs = 0) {
  if (!count || sampleRate <= 0) return receivedMs;
  if (std::isfinite(firstSampleMs) && firstSampleMs > 0) return firstSampleMs + (count - 1) * 1000. / sampleRate;
  return previousEndMs > 0 ? previousEndMs + count * 1000. / sampleRate : receivedMs;
}

struct BeatEvent {
  enum Kind : uint8_t { Kick = 0, Snare = 1, Hat = 2, Beat = 3 };
  Kind kind = Kick;
  bool downbeat = false;   // Beat only: first beat of the bar
  bool amend = false;      // raises the strength of the previous event of this kind
  uint8_t barBeat = 0;     // Beat only: 0..3, 0 = downbeat (valid when state.barKnown)
  double timeMs = 0;       // host clock time at which the light should appear (before user offset)
  float strength = 0;      // 0..1
  bool retract = false;    // the most recent event of this kind was misclassified: drop it
  uint64_t id = 0;         // corrections retain the original event's identity
};

struct BeatState {
  double bpm = 0, confidence = 0, periodMs = 0;
  bool locked = false, barKnown = false;
};

class BeatTracker {
public:
  static constexpr int kFft = 2048, kHop = 512, kBins = kFft / 2 + 1, kBands = 3, kHist = 128, kOnsetLen = 640;
  // Time from the physical attack to the hop at which the detector fires (measured by beat_test).
  static constexpr double kDetectMs = 14.0;

  explicit BeatTracker(double sampleRate = 48000.) { reset(sampleRate); }
  void setSensitivity(double sensitivity) { sens_ = std::clamp(sensitivity / 4., .25, 4.); }
  void reset(double sampleRate) {
    inputFs_ = std::isfinite(sampleRate) && sampleRate > 8000 ? sampleRate : 48000.;
    fs_ = std::min(inputFs_, 48000.);
    resamplePhase_ = resampleSum_ = levelRms_ = 0;
    ring_.fill(0); ringPos_ = sinceHop_ = 0; total_ = hopIndex_ = 0;
    for (int n = 0; n < kFft; ++n) window_[n] = float(.5 - .5 * std::cos(2 * 3.14159265358979323846 * n / kFft));
    for (unsigned i = 0, bits = 11; i < kFft; ++i) { unsigned r = 0; for (unsigned b = 0; b < bits; ++b) if (i >> b & 1) r |= 1u << (bits - 1 - b); rev_[i] = r; }
    for (int i = 0; i < kFft / 2; ++i) tw_[i] = std::polar(1.f, float(-2 * 3.14159265358979323846 * i / kFft));
    prevL_.fill(0);
    const double binHz = fs_ / kFft;
    const double edges[kBands][2] = {{35, 150}, {150, 2500}, {4000, 12000}};
    for (int b = 0; b < kBands; ++b) {
      lo_[b] = std::max(1, int(std::ceil(edges[b][0] / binHz)));
      hi_[b] = std::min(kBins - 2, int(std::floor(edges[b][1] / binHz)));
      hist_[b].fill(0); histPos_[b] = histCount_[b] = 0; prevFlux_[b] = 0; lastFire_[b] = -1000; lastStrength_[b] = 0; lastFlux_[b] = 0; lastThr_[b] = 1; norm_[b] = 0;
    }
    onset_.fill(0); onsetPos_ = onsetCount_ = 0;
    state_ = {}; events_.clear(); onsets_.clear(); eventId_ = 0; lastEvent_.fill(0);
    bpm_ = pendingBpm_ = 0; pendingCount_ = 0; periodMs_ = 0; nextBeatMs_ = 0; beatIndex_ = 0; locked_ = false;
    hitRate_ = 0; matched_ = false; kickLive_ = false; kickMid_ = 0; barEnergy_.fill(0); downIdx_ = 0; lastTempoHop_ = 0; conf_ = 0;
  }

  void push(const float* mono, size_t count, double nowMs) {
    for (size_t i = 0; i < count; ++i) {
      const float sample = std::isfinite(mono[i]) ? mono[i] : 0.f;
      const double at = nowMs - double(count - 1 - i) * 1000. / inputFs_;
      if (inputFs_ == fs_) append(sample, at);
      else {
        // Integrate input samples over each output interval. The phase survives
        // packet boundaries, including noninteger rates such as 88.2 kHz.
        const double step = fs_ / inputFs_;
        resampleSum_ += sample * step;
        resamplePhase_ += step;
        if (resamplePhase_ >= 1. - 1e-9) {
          const double excess = std::max(0., resamplePhase_ - 1.);
          append(float(resampleSum_ - sample * excess), at - excess * 1000. / fs_);
          resamplePhase_ = excess; resampleSum_ = sample * excess;
        }
      }
    }
  }
  std::vector<BeatEvent> takeEvents() { std::vector<BeatEvent> out; out.swap(events_); return out; }
  const BeatState& state() const { return state_; }

private:
  using Cx = std::complex<float>;
  double fs_ = 48000, inputFs_ = 48000, sens_ = 1;
  double resamplePhase_ = 0, resampleSum_ = 0, levelRms_ = 0;
  std::array<float, kFft> ring_{}, window_{};
  size_t ringPos_ = 0, sinceHop_ = 0; uint64_t total_ = 0; long hopIndex_ = 0;
  std::array<unsigned, kFft> rev_{}; std::array<Cx, kFft / 2> tw_{};
  std::array<float, kBins> prevL_{};
  int lo_[kBands]{}, hi_[kBands]{};
  std::array<float, kHist> hist_[kBands]{}; int histPos_[kBands]{}, histCount_[kBands]{};
  float prevFlux_[kBands]{}, lastFlux_[kBands]{}, lastStrength_[kBands]{}, lastThr_[kBands]{}; long lastFire_[kBands]{}; double norm_[kBands]{};
  std::array<float, kOnsetLen> onset_{}; int onsetPos_ = 0, onsetCount_ = 0;
  struct Hit { double t; float s; };
  std::vector<Hit> onsets_;
  double bpm_ = 0, pendingBpm_ = 0, periodMs_ = 0, nextBeatMs_ = 0, hitRate_ = 0, conf_ = 0; int pendingCount_ = 0;
  long beatIndex_ = 0, lastTempoHop_ = 0; bool locked_ = false, matched_ = false, kickLive_ = false; float kickMid_ = 0;
  std::array<double, 4> barEnergy_{}; int downIdx_ = 0;
  BeatState state_; std::vector<BeatEvent> events_;
  uint64_t eventId_ = 0;
  std::array<uint64_t, kBands> lastEvent_{};

  void fft(std::array<Cx, kFft>& a) const {
    for (unsigned i = 0; i < kFft; ++i) if (i < rev_[i]) std::swap(a[i], a[rev_[i]]);
    for (int len = 2; len <= kFft; len <<= 1) {
      const int step = kFft / len;
      for (int i = 0; i < kFft; i += len) for (int j = 0; j < len / 2; ++j) {
        const Cx u = a[i + j], v = a[i + j + len / 2] * tw_[j * step]; a[i + j] = u + v; a[i + j + len / 2] = u - v;
      }
    }
  }
  // Per band: floor (mean positive log-increase per bin), refractory ms, base std multiplier.
  static constexpr double kFloor[kBands] = {.25, .20, .12}, kRefractMs[kBands] = {120, 95, 45}, kStd[kBands] = {1.2, 1.2, 1.2}, kWeight[kBands] = {1., .7, .3};
  static constexpr double kRel = 2.5;

  void append(float sample, double at) {
    ring_[ringPos_] = sample; ringPos_ = (ringPos_ + 1) % kFft; ++total_;
    if (++sinceHop_ == kHop) { sinceHop_ = 0; if (total_ >= kFft) analyze(at); }
  }
  void analyze(double hopTime) {
    static thread_local std::array<Cx, kFft> a;
    double energy = 0;
    for (float x : ring_) energy += double(x) * x;
    const double rms = std::sqrt(energy / kFft);
    const double hopMs = 1000. * kHop / fs_;
    levelRms_ += (rms - levelRms_) * (levelRms_ == 0 ? 1. : 1. - std::exp(-hopMs / 2000.));
    // Normalize quiet playback before log compression. Smooth gain over two
    // seconds so individual drums retain their attack instead of being leveled
    // independently; cap gain to avoid amplifying digital silence indefinitely.
    const float gain = float(std::clamp(.04 / std::max(levelRms_, .000625), 1., 64.));
    for (int n = 0; n < kFft; ++n) a[n] = Cx(ring_[(ringPos_ + n) % kFft] * window_[n], 0.f);
    fft(a);
    std::array<float, kBins> L{};
    for (int k = 1; k < kBins; ++k) L[k] = std::log1p(1000.f * gain * std::abs(a[k]) / (kFft / 4.f));
    float flux[kBands];
    for (int b = 0; b < kBands; ++b) {
      double s = 0;
      for (int k = lo_[b]; k <= hi_[b]; ++k) { const float m = std::max({prevL_[k - 1], prevL_[k], prevL_[k + 1]}); s += std::max(0.f, L[k] - m); }
      flux[b] = float(s / (hi_[b] - lo_[b] + 1));
    }
    prevL_ = L; ++hopIndex_;

    // 1) Detect against the threshold built from PAST frames only, then update the history.
    bool fire[kBands]{}; float strength[kBands]{}, weight[kBands]{};
    for (int b = 0; b < kBands; ++b) {
      double mean = 0, var = 0; const int n = histCount_[b];
      for (int i = 0; i < n; ++i) mean += hist_[b][i];
      if (n) mean /= n;
      for (int i = 0; i < n; ++i) var += (hist_[b][i] - mean) * (hist_[b][i] - mean);
      if (n) var /= n;
      const double thr = kFloor[b] + mean + kStd[b] / std::sqrt(sens_) * std::sqrt(var);
      strength[b] = float(1. - std::exp(-.9 * std::max(0., flux[b] - thr) / thr));
      weight[b] = float(std::min(8., flux[b] / thr));
      fire[b] = n >= 24 && strength[b] >= .2f && flux[b] > thr && flux[b] > prevFlux_[b] && (hopIndex_ - lastFire_[b]) * hopMs >= kRefractMs[b];
      if (flux[b] < kRel * mean) fire[b] = false;
      lastThr_[b] = float(thr);
    }
#ifdef BEAT_DEBUG
    std::fprintf(stderr,"H %.1f f %.3f %.3f %.3f thr %.3f %.3f %.3f\n",hopTime,flux[0],flux[1],flux[2],lastThr_[0],lastThr_[1],lastThr_[2]);
#endif
    // Kick vs snare is the weakest part of the detector: the first hop of ANY drum hit raises every band.
    // Same-hop rule: a snare is as strong in the mids as in the lows. Next-hop rule: a kick keeps its low band,
    // a snare's low band collapses while the mids persist (the kick is retracted and re-issued as a snare).
    const long sinceKick = hopIndex_ - lastFire_[0], sinceMid = hopIndex_ - lastFire_[1];
    if (sinceKick == 1 && kickLive_ && flux[0] < .42f * lastFlux_[0] && flux[1] > .5f * kickMid_) {
      BeatEvent r; r.kind = BeatEvent::Kick; r.retract = true; r.timeMs = hopTime; r.id = lastEvent_[0]; events_.push_back(r);
      const float s = lastStrength_[0];
      events_.push_back({BeatEvent::Snare, false, false, 0, hopTime, s});
      events_.back().id = lastEvent_[1] = ++eventId_;
      lastFire_[0] = -1000; lastFire_[1] = hopIndex_; lastStrength_[1] = s; lastFlux_[1] = kickMid_;
      if (!onsets_.empty()) onsets_.pop_back();
      hit(hopTime - hopMs - kDetectMs, s, s, false);
      fire[1] = false; fire[0] = false;
    } else if (fire[1] && !fire[0] && sinceKick >= 1 && sinceKick <= 2) fire[1] = false;
    kickLive_ = false;
    if (fire[0] && fire[1]) { if (flux[1] > .8f * flux[0]) fire[0] = false; else fire[1] = false; }
    if (fire[2] && !fire[0] && !fire[1] && ((sinceKick >= 1 && sinceKick <= 2 && flux[2] < .5f * lastFlux_[0]) || (sinceMid >= 1 && sinceMid <= 2 && flux[2] < .5f * lastFlux_[1]))) fire[2] = false;
    if (fire[2] && (fire[0] || fire[1]) && flux[2] < .5f * std::max(fire[0] ? flux[0] : 0.f, fire[1] ? flux[1] : 0.f)) fire[2] = false;
    for (int b = 0; b < kBands; ++b) {
      if (fire[b]) {
        events_.push_back({BeatEvent::Kind(b), false, false, 0, hopTime, std::max(.15f, strength[b])});
        events_.back().id = lastEvent_[b] = ++eventId_;
        lastFire_[b] = hopIndex_; lastStrength_[b] = std::max(.15f, strength[b]); lastFlux_[b] = flux[b];
        if (b == 0) { kickLive_ = true; kickMid_ = flux[1]; }
        if (b < 2 && lastStrength_[b] >= .3f) hit(hopTime - kDetectMs, lastStrength_[b], weight[b] / 8.f, b == 0);
      } else if (hopIndex_ - lastFire_[b] >= 1 && hopIndex_ - lastFire_[b] <= 2 && flux[b] > prevFlux_[b] && strength[b] > lastStrength_[b] + .08f) {
        events_.push_back({BeatEvent::Kind(b), false, true, 0, hopTime, strength[b]});
        events_.back().id = lastEvent_[b];
        lastStrength_[b] = strength[b];
      }
      hist_[b][histPos_[b]] = flux[b]; histPos_[b] = (histPos_[b] + 1) % kHist; histCount_[b] = std::min(histCount_[b] + 1, int(kHist));
      prevFlux_[b] = flux[b];
    }

    // 2) Onset strength for tempo: per-band normalized flux.
    double o = 0;
    for (int b = 0; b < kBands; ++b) { norm_[b] += (flux[b] - norm_[b]) * (norm_[b] == 0 ? 1. : hopMs / 2000.); o += kWeight[b] * flux[b] / (norm_[b] + kFloor[b]); }
    onset_[onsetPos_] = float(o); onsetPos_ = (onsetPos_ + 1) % kOnsetLen; onsetCount_ = std::min(onsetCount_ + 1, int(kOnsetLen));
    if (hopIndex_ - lastTempoHop_ >= int(500 / hopMs) && onsetCount_ >= int(3000 / hopMs)) { lastTempoHop_ = hopIndex_; estimateTempo(hopMs); }
    while (!onsets_.empty() && hopTime - onsets_.front().t > 6000) onsets_.erase(onsets_.begin());
    grid(hopTime);
    state_.bpm = bpm_; state_.periodMs = periodMs_; state_.confidence = conf_; state_.locked = locked_;
    state_.barKnown = locked_ && barKnown();
  }

  void hit(double t, float s, float w, bool kick) {
    onsets_.push_back({t, s * (kick ? 1.f : .6f)});
    if (!locked_ || periodMs_ <= 0) return;
    const double k = std::round((t - nextBeatMs_) / periodMs_), err = t - (nextBeatMs_ + k * periodMs_);
    if (std::abs(err) > .2 * periodMs_) return;
    matched_ = true;
    nextBeatMs_ += .25 * err;
    const double base = 60000. / bpm_; periodMs_ = std::clamp(periodMs_ + .02 * err, base * .97, base * 1.03);
    barEnergy_[((beatIndex_ + long(k)) % 4 + 4) % 4] += w * (kick ? 1. : .5);
  }
  bool barKnown() const {
    double sum = 0, first = 0, second = 0;
    for (double e : barEnergy_) { sum += e; if (e > first) { second = first; first = e; } else if (e > second) second = e; }
    return sum > 1.2 && first > 1.4 * second;  // a tie (beats 1 and 3 identical) must NOT claim a downbeat
  }
  void estimateTempo(double hopMs) {
    const int M = onsetCount_; const double fr = 1000. / hopMs;
    std::vector<double> v(M); double mean = 0;
    for (int i = 0; i < M; ++i) { v[i] = onset_[(onsetPos_ - M + i + kOnsetLen) % kOnsetLen]; mean += v[i]; }
    mean /= M; for (auto& x : v) x -= mean;
    const int lmin = std::max(2, int(fr * 60 / 200)), lmax = int(std::ceil(fr * 60 / 60)), top = std::min(2 * lmax + 2, M - 8);
    std::vector<double> ac(top + 1, 0.);
    for (int l = 0; l <= top; ++l) { double s = 0; for (int i = l; i < M; ++i) s += v[i] * v[i - l]; ac[l] = s / (M - l); }
    if (ac[0] <= 1e-9) { conf_ = 0; return; }
    int best = 0; double bestScore = -1e9;
    for (int l = lmin; l <= lmax && 2 * l <= top; ++l) {
      const double bpm = 60. * fr / l, oct = std::log2(bpm / 125.);
      const double score = (ac[l] + .5 * ac[2 * l]) / ac[0] * std::exp(-.5 * oct * oct / (.75 * .75));
      if (score > bestScore) { bestScore = score; best = l; }
    }
    if (!best) return;
    double lag = best;
    if (best > 1 && best < top) { const double y0 = ac[best - 1], y1 = ac[best], y2 = ac[best + 1], d = y0 - 2 * y1 + y2; if (d < 0) lag += std::clamp(.5 * (y0 - y2) / d, -.5, .5); }
    const double bpm = 60. * fr / lag;
    conf_ = std::clamp((ac[best] / ac[0] - .10) / .30, 0., 1.);
    if (bpm_ == 0 || std::abs(bpm - bpm_) / bpm_ < .04) { bpm_ = bpm_ == 0 ? bpm : .5 * bpm_ + .5 * bpm; pendingCount_ = 0; }
    else if (pendingCount_ > 0 && std::abs(bpm - pendingBpm_) / pendingBpm_ < .04) { if (++pendingCount_ >= 2) { bpm_ = bpm; pendingCount_ = 0; } }
    else { pendingBpm_ = bpm; pendingCount_ = 1; }
    if (!locked_) periodMs_ = 60000. / bpm_;
  }

  void grid(double hopTime) {
    if (!locked_) {
      if (conf_ >= .35 && bpm_ > 0 && onsets_.size() >= 6) {
        periodMs_ = 60000. / bpm_;
        double re = 0, im = 0; for (auto& h : onsets_) { const double ph = 2 * 3.14159265358979323846 * h.t / periodMs_; re += h.s * std::cos(ph); im += h.s * std::sin(ph); }
        double phase = std::atan2(im, re) / (2 * 3.14159265358979323846) * periodMs_;
        nextBeatMs_ = phase + std::ceil((hopTime - kDetectMs - phase) / periodMs_) * periodMs_;
        locked_ = true; hitRate_ = .6; matched_ = false; beatIndex_ = 0; barEnergy_.fill(0); downIdx_ = 0;
      }
      return;
    }
    if (conf_ < .12 || hitRate_ < .22 || bpm_ <= 0) { locked_ = false; return; }
    // Emit grid beats up to 120 ms ahead so the user offset can pull them earlier than the reactive path.
    while (nextBeatMs_ + kDetectMs <= hopTime + 120.) {
      hitRate_ = .85 * hitRate_ + .15 * (matched_ ? 1. : 0.); matched_ = false;
      for (auto& e : barEnergy_) e *= .985;
      int mx = 0; for (int i = 1; i < 4; ++i) if (barEnergy_[i] > barEnergy_[mx]) mx = i;
      downIdx_ = mx;
      BeatEvent e; e.kind = BeatEvent::Beat; e.timeMs = nextBeatMs_ + kDetectMs;
      e.id = ++eventId_;
      e.barBeat = uint8_t(((beatIndex_ - downIdx_) % 4 + 4) % 4); e.downbeat = barKnown() && e.barBeat == 0;
      e.strength = float(.55 + .45 * conf_);
      events_.push_back(e);
      ++beatIndex_; nextBeatMs_ += periodMs_;
    }
  }
};
}  // namespace rhythm
