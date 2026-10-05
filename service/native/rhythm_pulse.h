#pragma once
// "Beat Pulse": a rhythm-sync key effect driven by BeatTracker events instead of an envelope.
//   kick  -> shockwave ring rising from the space bar, white leading edge, fading trail
//   snare -> light slash sweeping across all rows, alternating direction
//   hat   -> a few short sparkles
//   beat  -> number row is a bar playhead (1-2-3-4) and the whole board breathes on the beat grid (only when locked)
// Everything is a function of event TIME, so the 60 Hz render never adds jitter to the beats.
#include <algorithm>
#include <cmath>
#include <vector>
#include "rhythm_core.h"
#include "rhythm_beat.h"

namespace rhythm {

class PulseEffect {
public:
  struct Settings { double brightness = 80, offsetMs = 0; int palette = 1; Color color{246, 17, 165}; };
  static constexpr int kMode = 430;  // key mode id (host-rendered, never sent to firmware)

  void reset() { rings_.clear(); slashes_.clear(); sparks_.clear(); pending_.clear(); big_.clear(); lift_ = {}; haveBeat_ = false; phase_ = curBeatMs_ = 0; curBar_ = 0; flip_ = 0; rng_ = 2463534242u; st_ = {}; }

  void feed(const std::vector<BeatEvent>& events, const BeatState& st) {
    st_ = st;
    if (!st_.locked) { pending_.clear(); haveBeat_ = false; }
    for (const auto& e : events) {
      if (e.retract) {
        if (!e.id) continue;
        rings_.erase(std::remove_if(rings_.begin(), rings_.end(), [&](const Ring& r) { return r.source == e.id; }), rings_.end());
        slashes_.erase(std::remove_if(slashes_.begin(), slashes_.end(), [&](const Slash& s) { return s.source == e.id; }), slashes_.end());
        sparks_.erase(std::remove_if(sparks_.begin(), sparks_.end(), [&](const Spark& s) { return s.source == e.id; }), sparks_.end());
        continue;
      }
      if (e.amend) {
        if (!e.id) continue;
        for (auto& r : rings_) if (r.source == e.id) r.amp = std::max(r.amp, r.gain * (e.kind == BeatEvent::Kick ? ringAmp(e.strength) : .16 * e.strength));
        for (auto& s : slashes_) if (s.source == e.id) s.amp = std::max(s.amp, s.gain * (e.kind == BeatEvent::Snare ? .3 + .7 * e.strength : .18 * e.strength));
        for (auto& s : sparks_) if (s.source == e.id) s.amp = std::max(s.amp, .35 + .65 * e.strength);
        continue;
      }
      switch (e.kind) {
        case BeatEvent::Kick: {
          const double speed = st_.locked && st_.periodMs > 0 ? std::clamp(10. / (.85 * st_.periodMs / 1000.), 14., 40.) : 22.;
          rings_.push_back({e.timeMs, 8., 4.5, govern(e.timeMs, ringAmp(e.strength)), speed, false, phase_, e.id});
          rings_.back().gain = rings_.back().amp / ringAmp(e.strength);
          slashes_.push_back({e.timeMs, .18 * e.strength, flip_ = !flip_, std::fmod(phase_ + .5, 1.), e.id});
          phase_ = std::fmod(phase_ + .09, 1.);
          // cross-talk: classification is heuristic, so a kick also leaves a faint slash (and a snare a faint ring)
          break;
        }
        case BeatEvent::Snare:
          slashes_.push_back({e.timeMs, govern(e.timeMs, .3 + .7 * e.strength), flip_ = !flip_, std::fmod(phase_ + .5, 1.), e.id});
          slashes_.back().gain = slashes_.back().amp / (.3 + .7 * e.strength);
          rings_.push_back({e.timeMs, 8., 4.5, .16 * e.strength, 26., false, phase_, e.id});
          break;
        case BeatEvent::Hat:
          for (int i = 0, n = e.strength > .5f ? 3 : 2; i < n && sparks_.size() < 14; ++i) sparks_.push_back({e.timeMs, .35 + .65 * e.strength, int(next() % 68), std::fmod(phase_ + .25, 1.), e.id});
          break;
        case BeatEvent::Beat: if (st_.locked) pending_.push_back(e); break;
      }
    }
    if (rings_.size() > 8) rings_.erase(rings_.begin(), rings_.end() - 8);
    if (slashes_.size() > 6) slashes_.erase(slashes_.begin(), slashes_.end() - 6);
  }

  Frame render(double nowMs, const Settings& set) {
    const double vnow = nowMs - set.offsetMs;  // positive offset delays the light, negative pulls grid beats earlier
    // promote grid beats whose (offset-adjusted) time has come
    for (size_t i = 0; i < pending_.size();) {
      if (pending_[i].timeMs <= vnow) {
        const auto b = pending_[i]; curBeatMs_ = b.timeMs; curBar_ = b.barBeat; haveBeat_ = true; pending_.erase(pending_.begin() + i);
        if (b.downbeat && vnow - b.timeMs < 120) { rings_.push_back({b.timeMs, 8., 2., govern(b.timeMs, .95), 30., true, phase_, b.id}); lift_ = {b.timeMs, govern(b.timeMs, .16)}; phase_ = std::fmod(phase_ + .2, 1.); }
      } else ++i;
    }
    while (!pending_.empty() && vnow - pending_.front().timeMs > 600) pending_.erase(pending_.begin());
    prune(vnow);

    const double peakCap = (set.palette == 3 || (set.palette == 0 && set.color[0] >= 200 && set.color[1] < 90 && set.color[2] < 90)) ? .75 : 1.;
    const double period = st_.periodMs > 0 ? st_.periodMs : 500;
    const bool grid = st_.locked && haveBeat_ && vnow - curBeatMs_ < 2.5 * period;
    const double ph = grid ? std::clamp((vnow - curBeatMs_) / period, 0., 1.) : 1.;
    const double conf = std::clamp((st_.confidence - .2) / .4, 0., 1.);

    Frame out; const double bright = set.brightness / 100.;
    for (size_t i = 0; i < keys_.size(); ++i) {
      const auto k = keys_[i]; const double nx = k.x / 16;
      double r = 0, g = 0, b = 0;
      auto add = [&](const std::array<double, 3>& c, double v) { r += c[0] * v; g += c[1] * v; b += c[2] * v; };
      // ambient + tempo-locked breathing
      add(pal(set, phase_ + nx * .25), .03 + (grid ? .09 * conf * std::exp(-4.2 * ph) : 0.));
      for (const auto& rg : rings_) {
        const double age = (vnow - rg.t0) / 1000.; if (age < 0) continue;
        const double dd = std::hypot(k.x - rg.ox, (k.y - rg.oy)) - rg.speed * age, env = std::exp(-age / (rg.big ? .42 : .30));
        const double edge = std::exp(-dd * dd / (2 * .85 * .85)), trail = dd < 0 ? std::exp(dd / 2.1) : 0.;
        const double v = rg.amp * env * (edge + .5 * trail);
        if (v < .004) continue;
        add(mix(pal(set, rg.h + nx * .08), {1, 1, 1}, std::min(.7, edge * env * rg.amp * .8)), v);
      }
      for (const auto& s : slashes_) {
        const double age = (vnow - s.t0) / 1000.; if (age < 0) continue;
        const double head = s.dir ? -2. + 62. * age : 18. - 62. * age, dx = k.x - head, behind = s.dir ? -dx : dx;
        const double v = s.amp * std::exp(-age / .20) * (std::exp(-dx * dx / (2 * 1.1 * 1.1)) + (behind > 0 ? .35 * std::exp(-behind / 2.6) : 0.));
        if (v < .004) continue;
        add(mix(pal(set, s.h + nx * .08), {1, 1, 1}, .35), v);
      }
      for (const auto& sp : sparks_) {
        if (sp.key != int(i)) continue;
        const double age = (vnow - sp.t0) / 1000.; if (age < 0 || age > .10) continue;
        add(mix(pal(set, sp.h), {1, 1, 1}, .6), sp.amp * (1. - age / .10));
      }
      if (lift_.amp > 0) { const double age = (vnow - lift_.t0) / 1000.; if (age >= 0) add(pal(set, phase_ + .1), lift_.amp * std::exp(-age / .12)); }
      // number row = beat clock. Unknown bar position: one sweep per beat (always true once the grid is locked).
      // Known bar position (clear accent pattern only): a 4-step playhead with the downbeat tick brighter.
      if (grid && k.y < .5) {
        double v = 0;
        if (st_.barKnown) {
          const double pos = (curBar_ + ph) / 4. * 16., dx = k.x - pos;
          v = std::exp(-dx * dx / (2 * .55 * .55)) + (dx < 0 ? .5 * std::exp(dx / 1.8) : 0.);
          for (int t = 0; t < 4; ++t) { const double d = k.x - (t * 4 + .5); v += (t == 0 ? .24 : .12) * std::exp(-d * d / (2 * .45 * .45)); }
        } else {
          const double dx = k.x - ph * 16.;
          v = .8 * std::exp(-dx * dx / (2 * .7 * .7)) + (dx < 0 ? .4 * std::exp(dx / 2.2) : 0.);
        }
        add(mix(pal(set, phase_ + .15), {1, 1, 1}, .55), .8 * conf * v);
      }
      Color c{};
      const double ch[3] = {r, g, b};
      for (int n = 0; n < 3; ++n) {
        double v = (1. - std::exp(-2.2 * ch[n])) / (1. - std::exp(-2.2));  // soft clip
        v = std::pow(std::min({v, 1., peakCap}), 1.8) * bright;             // LED PWM is linear: gamma keeps the trails smooth
        c[n] = uint8_t(std::clamp(std::lround(v * 255), 0L, 255L));
      }
      out.keys[i] = c; out.level = std::max(out.level, std::max({c[0], c[1], c[2]}) / 255.);
    }
    return out;
  }

private:
  struct Ring { double t0, ox, oy, amp, speed; bool big; double h; uint64_t source = 0; double gain = 1; };
  struct Slash { double t0, amp; bool dir; double h; uint64_t source = 0; double gain = 1; };
  struct Spark { double t0, amp; int key; double h; uint64_t source = 0; };
  struct Lift { double t0 = 0, amp = 0; };
  using V3 = std::array<double, 3>;
  std::vector<Ring> rings_; std::vector<Slash> slashes_; std::vector<Spark> sparks_; std::vector<BeatEvent> pending_;
  std::vector<double> big_; Lift lift_; BeatState st_;
  const std::array<Key, 68> keys_ = geometry();
  double phase_ = 0, curBeatMs_ = 0; int curBar_ = 0; bool haveBeat_ = false, flip_ = false;
  uint32_t rng_ = 2463534242u;
  uint32_t next() { rng_ ^= rng_ << 13; rng_ ^= rng_ >> 17; rng_ ^= rng_ << 5; return rng_; }
  static double ringAmp(double s) { return .35 + .65 * s; }

  // Flash governor: at most three large events per second; further ones are halved (WCAG 2.3.1 spirit, conservative).
  double govern(double t, double amp) {
    while (!big_.empty() && t - big_.front() > 1000.) big_.erase(big_.begin());
    if (big_.size() >= 3) amp *= .5;
    if (amp >= .5) big_.push_back(t);
    return amp;
  }
  void prune(double vnow) {
    rings_.erase(std::remove_if(rings_.begin(), rings_.end(), [&](const Ring& r) { return vnow - r.t0 > 1100; }), rings_.end());
    slashes_.erase(std::remove_if(slashes_.begin(), slashes_.end(), [&](const Slash& s) { return vnow - s.t0 > 900; }), slashes_.end());
    sparks_.erase(std::remove_if(sparks_.begin(), sparks_.end(), [&](const Spark& s) { return vnow - s.t0 > 160; }), sparks_.end());
    if (lift_.amp > 0 && vnow - lift_.t0 > 700) lift_.amp = 0;
  }
  static V3 mix(const V3& a, const V3& b, double t) { return {a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t}; }
  // Palette position p (any real; wrapped to 0..1). One hue per EVENT keeps blended light clean and lets each beat read as its own colour.
  static V3 pal(const Settings& s, double p) {
    if (s.palette == 0) return {s.color[0] / 255., s.color[1] / 255., s.color[2] / 255.};
    p -= std::floor(p);
    const double hue = s.palette == 1 ? p * 360 : s.palette == 2 ? 160 + p * 120 : p * 45;
    const auto c = hsv(hue, 1.);
    return {c[0] / 255., c[1] / 255., c[2] / 255.};
  }
};
}  // namespace rhythm
