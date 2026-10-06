#include <cstdio>
#include <cstdlib>
#include <random>
#include <map>
#include "../service/native/rhythm_core.h"
#include "../service/native/rhythm_beat.h"
using namespace rhythm;

struct Song { std::vector<float> pcm; std::vector<double> kicks, snares, hats, beats, downs; double fs; };

static Song makeSong(double fs, double bpm, double seconds, unsigned seed, bool busy = true) {
  Song s; s.fs = fs; const size_t n = size_t(fs * seconds); s.pcm.assign(n, 0.f);
  std::mt19937 rng(seed); std::normal_distribution<double> g(0, 1);
  const double beat = 60. / bpm; const double pi = 3.14159265358979323846;
  auto add = [&](size_t at, const std::vector<float>& x) { for (size_t i = 0; i < x.size() && at + i < n; ++i) s.pcm[at + i] += x[i]; };
  auto kick = [&](double amp) { std::vector<float> x(size_t(fs * .35)); double ph = 0; for (size_t i = 0; i < x.size(); ++i) { double t = i / fs, f = 45 + 105 * std::exp(-t / .03); ph += 2 * pi * f / fs; x[i] = float(amp * std::sin(ph) * std::exp(-t / .12)); } return x; };
  auto snare = [&](double amp) { std::vector<float> x(size_t(fs * .25)); for (size_t i = 0; i < x.size(); ++i) { double t = i / fs; x[i] = float(amp * (.55 * g(rng) * std::exp(-t / .09) + .3 * std::sin(2 * pi * 190 * t) * std::exp(-t / .06) + .15 * std::sin(2 * pi * 330 * t) * std::exp(-t / .05))); } return x; };
  auto hat = [&](double amp) { std::vector<float> x(size_t(fs * .08)); double p1 = 0, p2 = 0; for (size_t i = 0; i < x.size(); ++i) { double t = i / fs, w = g(rng); double h = w - p1 + .5 * (p1 - p2); p2 = p1; p1 = w; x[i] = float(amp * h * .5 * std::exp(-t / .02)); } return x; };
  for (int b = 0;; ++b) {
    const double t = 0.5 + b * beat; if (t >= seconds - .4) break; const size_t at = size_t(t * fs);
    s.beats.push_back(t); if (b % 4 == 0) s.downs.push_back(t);
    const int bar = b % 4;
    if (bar == 0 || bar == 2) { add(at, kick(bar == 0 ? 1.0 : .7)); s.kicks.push_back(t); }
    if (bar == 3 && busy) { const double t2 = t + beat * .5; add(size_t(t2 * fs), kick(.6)); s.kicks.push_back(t2); }
    if (bar == 1 || bar == 3) { add(at, snare(.6)); s.snares.push_back(t); }
    add(at, hat(.25)); s.hats.push_back(t); const double t3 = t + beat * .5; add(size_t(t3 * fs), hat(.18)); s.hats.push_back(t3);
  }
  // sustained bass + pad + noise floor
  double pb = 0; for (size_t i = 0; i < n; ++i) { double t = i / fs; pb += 2 * pi * 55 / fs; s.pcm[i] += float(busy ? .12 * std::sin(pb) * (.8 + .2 * std::sin(2 * pi * t / (beat * 8))) : 0.);
    s.pcm[i] += float(busy ? .05 * (std::sin(2 * pi * 220 * t) + std::sin(2 * pi * 277.2 * t) + std::sin(2 * pi * 329.6 * t)) : 0.); s.pcm[i] += float(.0015 * g(rng)); }
  return s;
}

struct Result { std::vector<BeatEvent> ev; std::vector<double> lockedAt; double lockTime = -1, bpm = 0; };
static Result run(const Song& s, size_t block, double sens = 4) {
  BeatTracker tr(s.fs); tr.setSensitivity(sens); Result r; double t = 0;
  for (size_t i = 0; i < s.pcm.size(); i += block) {
    const size_t c = std::min(block, s.pcm.size() - i); t = double(i + c) * 1000. / s.fs;
    tr.push(&s.pcm[i], c, t);
    for (auto& e : tr.takeEvents()) { if (e.retract) { for (size_t j = r.ev.size(); j-- > 0;) if (r.ev[j].id == e.id && !r.ev[j].amend) { r.ev.erase(r.ev.begin() + j); break; } } else r.ev.push_back(e); }
    if (r.lockTime < 0 && tr.state().locked) r.lockTime = t / 1000.;
    r.bpm = tr.state().bpm;
  }
  return r;
}
struct Score { int tp = 0, fp = 0, fn = 0; std::vector<double> lat; };
static Score match(const std::vector<BeatEvent>& ev, BeatEvent::Kind kind, const std::vector<double>& truth, double from, double lo = -10, double hi = 70) {
  Score sc; std::vector<char> used(ev.size(), 0);
  for (double t : truth) {
    if (t < from) continue;
    bool found = false;
    for (size_t i = 0; i < ev.size(); ++i) if (!used[i] && ev[i].kind == kind && !ev[i].amend) { const double d = ev[i].timeMs - t * 1000.; if (d >= lo && d <= hi) { used[i] = 1; sc.lat.push_back(d); found = true; break; } }
    found ? ++sc.tp : ++sc.fn;
  }
  for (size_t i = 0; i < ev.size(); ++i) if (!used[i] && ev[i].kind == kind && !ev[i].amend && ev[i].timeMs / 1000. >= from) ++sc.fp;
  return sc;
}
static Score matchHits(const std::vector<BeatEvent>& ev, const std::vector<double>& truth, double from, int& classOk, const std::vector<double>& kicks) {
  Score sc; std::vector<char> used(ev.size(), 0);
  for (double t : truth) { if (t < from) continue; bool found = false;
    for (size_t i = 0; i < ev.size(); ++i) if (!used[i] && (ev[i].kind == BeatEvent::Kick || ev[i].kind == BeatEvent::Snare) && !ev[i].amend) { const double d = ev[i].timeMs - t * 1000.; if (d >= -10 && d <= 70) { used[i] = 1; sc.lat.push_back(d); found = true; bool isKick = std::find(kicks.begin(), kicks.end(), t) != kicks.end(); if ((ev[i].kind == BeatEvent::Kick) == isKick) ++classOk; break; } }
    found ? ++sc.tp : ++sc.fn; }
  for (size_t i = 0; i < ev.size(); ++i) if (!used[i] && (ev[i].kind == BeatEvent::Kick || ev[i].kind == BeatEvent::Snare) && !ev[i].amend && ev[i].timeMs / 1000. >= from) ++sc.fp;
  return sc; }
static double pct(std::vector<double> v, double p) { if (v.empty()) return 0; std::sort(v.begin(), v.end()); return v[std::min(v.size() - 1, size_t(p * v.size()))]; }
static int failures = 0;
static void check(bool ok, const char* what) { if (!ok) { ++failures; std::printf("   FAIL: %s\n", what); } }

int main(int argc, char** argv) {
  if (argc > 1 && std::string(argv[1]) == "dump") return 0;
  struct Case { double fs, bpm; size_t block; };
  const Case cases[] = {{48000, 100, 480}, {48000, 120, 480}, {48000, 128, 441}, {44100, 128, 441}, {48000, 140, 333}, {44100, 150, 1024}, {48000, 170, 480}};
  for (auto c : cases) {
    const double from = 6.0; Song s = makeSong(c.fs, c.bpm, 40, unsigned(c.bpm * 7));
    Result r = run(s, c.block);
    Score k = match(r.ev, BeatEvent::Kick, s.kicks, from), sn = match(r.ev, BeatEvent::Snare, s.snares, from), h = match(r.ev, BeatEvent::Hat, s.hats, from);
    auto line = [&](const char* n, Score& q) { const double p = q.tp + q.fp ? double(q.tp) / (q.tp + q.fp) : 1, rc = q.tp + q.fn ? double(q.tp) / (q.tp + q.fn) : 1;
      std::printf("   %-5s P=%.2f R=%.2f  latency median=%.1f p95=%.1f ms (n=%d)\n", n, p, rc, pct(q.lat, .5), pct(q.lat, .95), q.tp); return std::make_pair(p, rc); };
    std::printf("fs=%.0f bpm=%.0f block=%zu -> tempo %.1f  lock at %.1fs\n", c.fs, c.bpm, c.block, r.bpm, r.lockTime);
    auto pk = line("kick", k); auto ps = line("snare", sn); auto ph = line("hat", h);
    std::vector<double> allHits = s.kicks; allHits.insert(allHits.end(), s.snares.begin(), s.snares.end()); int classOk = 0;
    Score hs = matchHits(r.ev, allHits, from, classOk, s.kicks);
    std::printf("   HIT   (kick or snare, class ignored) P=%.2f R=%.2f  class accuracy %.2f\n", double(hs.tp) / (hs.tp + hs.fp), double(hs.tp) / (hs.tp + hs.fn), double(classOk) / hs.tp);
    check(double(hs.tp) / (hs.tp + hs.fp) > .9 && double(hs.tp) / (hs.tp + hs.fn) > .95, "hit P>0.9 R>0.95"); check(double(classOk) / hs.tp > .75, "kick/snare class accuracy > 0.75"); check(ph.second > .6, "hat recall > 0.6"); (void)pk; (void)ps;
    check(pct(k.lat, .95) < 40, "kick p95 latency < 40 ms");
    const double ratio = r.bpm / c.bpm; check(std::abs(ratio - 1) < .03 || std::abs(ratio - 2) < .06 || std::abs(ratio - .5) < .03, "tempo within 3% (or octave)");
    check(r.lockTime > 0 && r.lockTime < 12, "locks within 12 s");
    // grid beats vs true beats (light time vs true beat time + expected reactive latency)
    std::vector<double> err; int downOk = 0, downAll = 0, falseDown = 0; std::vector<double> truthMs; for (double t : s.beats) truthMs.push_back(t * 1000);
    for (auto& e : r.ev) if (e.kind == BeatEvent::Beat && e.timeMs / 1000. > from + 4 && e.timeMs / 1000. < 36) {
      double bestd = 1e9; for (double t : truthMs) if (std::abs(e.timeMs - t) < std::abs(bestd)) bestd = e.timeMs - t;
      err.push_back(bestd);
      bool isDown = false; for (double t : s.downs) if (std::abs(e.timeMs - t * 1000) < 120) isDown = true;
      if (e.downbeat) { ++downAll; if (isDown) ++downOk; else ++falseDown; }
    }
    int nb = 0; for (double t : s.beats) if (t > from + 4 && t < 36) ++nb;
    double mean = 0; for (double e : err) mean += e; if (!err.empty()) mean /= err.size();
    std::vector<double> aerr; for (double e : err) aerr.push_back(std::abs(e - mean));
    std::printf("   grid  n=%zu/%d  mean offset %.1f ms  spread p95 %.1f ms  downbeat %d/%d correct\n", err.size(), nb, mean, pct(aerr, .95), downOk, downAll);
    check(double(err.size()) > .9 * nb && double(err.size()) < 1.1 * nb + 2, "grid emits ~1 beat per beat");
    check(pct(aerr, .95) < 30, "grid jitter p95 < 30 ms");
    check(downAll == 0 || double(downOk) / downAll > .8, "downbeat flag mostly correct");
  }
  // WASAPI can expose high-rate endpoints and very quiet playback. The original
  // detector never reached its 3-second tempo history at 192 kHz and missed
  // almost every hit at -50 dB. Exercise real PCM rates, not mocked events.
  for(double fs:{44100.,48000.,88200.,96000.,192000.})for(double gain:{1.,.00316}) {
    Song s=makeSong(fs,128,18,896);for(auto& x:s.pcm)x*=float(gain);
    const auto r=run(s,size_t(fs/100)+13);
    int classified=0;const auto hits=matchHits(r.ev,s.beats,6,classified,s.kicks);
    std::printf("rate/level regression: fs %.0f gain %.5f bpm %.1f lock %.1f\n",fs,gain,r.bpm,r.lockTime);
    check(r.lockTime>=0&&r.lockTime<6,"high-rate and quiet PCM locks within six seconds");
    check(std::abs(r.bpm-128)<2,"high-rate and quiet PCM retains tempo");
    check(hits.tp>0&&double(hits.tp)/(hits.tp+hits.fn)>.85,"quiet/high-rate beat recall exceeds 85 percent");
  }
  // Capture receipt jitter must not change event timing when sample QPC is valid.
  {Song s=makeSong(48000,128,12,896);std::vector<BeatEvent> reference;
    for(int scenario=0;scenario<3;++scenario){BeatTracker tr(s.fs);std::vector<BeatEvent> events;double previous=0;
      for(size_t i=0;i<s.pcm.size();i+=480){size_t c=std::min<size_t>(480,s.pcm.size()-i);
        const double first=1000+i*1000./s.fs,received=first+c*1000./s.fs+40*(.5+.5*std::sin(first*.015));
        const bool invalid=scenario==2&&i>0&&(i/480)%13==0;
        previous=beatPacketEndMs(invalid?0:first,c,s.fs,scenario?received:first+c*1000./s.fs,previous);
        tr.push(&s.pcm[i],c,previous);auto out=tr.takeEvents();events.insert(events.end(),out.begin(),out.end());}
      if(!scenario)reference=events;else{check(events.size()==reference.size(),"packet jitter preserves event count");
        for(size_t i=0;i<std::min(events.size(),reference.size());++i)check(events[i].id==reference[i].id&&events[i].kind==reference[i].kind&&std::abs(events[i].timeMs-reference[i].timeMs)<.001,"QPC/fallback keeps event timing independent of receipt");}}
    check(beatPacketEndMs(0,480,48000,1234)==1234,"first invalid packet uses capture receipt fallback");}
  // Every correction identifies an existing event; fresh events have unique IDs.
  {Song s=makeSong(48000,128,12,896);BeatTracker tr(s.fs);std::map<uint64_t,BeatEvent::Kind> ids;
    for(size_t i=0;i<s.pcm.size();i+=480){size_t c=std::min<size_t>(480,s.pcm.size()-i);tr.push(&s.pcm[i],c,(i+c)*1000./s.fs);
      for(const auto& e:tr.takeEvents()){if(e.amend||e.retract)check(ids.count(e.id)&&ids[e.id]==e.kind,"correction refers to the same source and kind");
        else{check(e.id!=0&&!ids.count(e.id),"fresh event IDs are nonzero and unique");ids[e.id]=e.kind;}}}}
  // negative tests
  struct Neg { const char* name; std::vector<float> pcm; };
  std::mt19937 rng(5); std::normal_distribution<double> g(0, 1); const double fs = 48000; std::vector<Neg> negs;
  negs.push_back({"digital silence", std::vector<float>(size_t(fs * 20), 0.f)});
  { std::vector<float> x(size_t(fs * 20)); for (auto& v : x) v = float(.0008 * g(rng)); negs.push_back({"-62 dBFS noise floor", x}); }
  { std::vector<float> x(size_t(fs * 20)); for (size_t i = 0; i < x.size(); ++i) { double t = i / fs; x[i] = float(.1 * (std::sin(6.283185 * 220 * t) + std::sin(6.283185 * 277.2 * t) + std::sin(6.283185 * 329.6 * t)) * (.8 + .2 * std::sin(6.283185 * .2 * t)) + .0015 * g(rng)); } negs.push_back({"steady pad with slow swell", x}); }
  { std::vector<float> x(size_t(fs * 20)); double b0 = 0, b1 = 0, b2 = 0; for (auto& v : x) { double w = g(rng); b0 = .99765 * b0 + w * .0990460; b1 = .96300 * b1 + w * .2965164; b2 = .57000 * b2 + w * 1.0526913; v = float(.06 * (b0 + b1 + b2 + w * .1848)); } negs.push_back({"pink noise at about -20 dBFS", x}); }
  { std::vector<float> x(size_t(fs * 20)); for (size_t i = 0; i < x.size(); ++i) { double t = i / fs; double vib = 8 * std::sin(6.283185 * 5.5 * t); x[i] = float(.2 * std::sin(6.283185 * 440 * t + vib)); } negs.push_back({"vibrato tone", x}); }
  for (auto& n : negs) {
    BeatTracker tr(fs); int cnt[4] = {};std::vector<BeatEvent> detected;
    for (size_t i = 0; i < n.pcm.size(); i += 480) { tr.push(&n.pcm[i], std::min<size_t>(480, n.pcm.size() - i), double(i) * 1000 / fs);
      for (auto& e : tr.takeEvents()) {if(e.retract)detected.erase(std::remove_if(detected.begin(),detected.end(),[&](const BeatEvent& original){return original.id==e.id;}),detected.end());else if(!e.amend)detected.push_back(e);} }
    for(const auto& e:detected)++cnt[e.kind];
    std::printf("negative '%s': kick=%d snare=%d hat=%d beat=%d locked=%d\n", n.name, cnt[0], cnt[1], cnt[2], cnt[3], tr.state().locked);
    check(cnt[0] + cnt[1] + cnt[2] <= 6 && cnt[3] == 0, "<=6 spurious onsets in 20 s and no grid beats");
  }
  // level independence: same song 30 dB quieter
  { Song s = makeSong(48000, 128, 30, 3); Song q = s; for (auto& v : q.pcm) v *= .0316f; Result a = run(s, 480), b = run(q, 480);
    Score ka = match(a.ev, BeatEvent::Kick, s.kicks, 6), kb = match(b.ev, BeatEvent::Kick, s.kicks, 6);
    std::printf("level test: kick recall full=%.2f  -30dB=%.2f  (fp %d / %d)\n", double(ka.tp) / (ka.tp + ka.fn), double(kb.tp) / (kb.tp + kb.fn), ka.fp, kb.fp);
    check(double(kb.tp) / (kb.tp + kb.fn) > .85, "-30 dB recall > 0.85"); }
  // sensitivity sweep on a sparse song
  { Song s = makeSong(48000, 120, 30, 9, false);
    for (double sens : {1., 4., 8.}) { Result r = run(s, 480, sens); Score k = match(r.ev, BeatEvent::Kick, s.kicks, 6); std::printf("sensitivity %.0f: kick P=%.2f R=%.2f\n", sens, k.tp + k.fp ? double(k.tp) / (k.tp + k.fp) : 1., double(k.tp) / (k.tp + k.fn)); } }
  std::printf(failures ? "\n%d check(s) FAILED\n" : "\nALL CHECKS PASSED\n", failures);
  return failures ? 1 : 0;
}
