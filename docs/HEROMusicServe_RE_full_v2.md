# HEROMusicServe.exe — tài liệu Reverse Engineering đầy đủ

> **RE pass 2 — 27/09/2026**  
> Bản này cập nhật các phần trước còn chưa chốt: xác nhận **Dynamic Spectrum 428 dùng FFT 256 điểm thật**, bóc window/smoothing/palette/field mapping/`db`, chốt thêm state machine của 170/173, sửa hướng history của 172, bóc sâu side `500–503`, và xác nhận `168` **không còn implementation live trong binary này**. Những kết luận cũ mâu thuẫn với pass 2 đã được thay trực tiếp, không để song song gây nhầm.

> **Mục tiêu của tài liệu:** mô tả cấu trúc `HEROMusicServe.exe`, pipeline audio → LED → HID, format frame/protocol đã xác nhận, cơ chế của từng LED rhythm mode, các điểm chưa xác định hoàn toàn, và kiến trúc/C++ pseudocode đủ để viết một EXE riêng thay cho service stock.
>
> File phân tích: `HEROMusicServe.exe`  
> SHA-256: `73f264a2909432766f95e0995c2e1c923c504dfa4a98345387335e129d0619b9`

---

## 0. Quy ước độ chắc chắn

Tài liệu dùng ba mức:

- **✅ Confirmed** — xác nhận trực tiếp từ string/config/disassembly/control-flow của binary.
- **🟡 High-confidence** — suy ra rất mạnh từ cấu trúc dữ liệu, geometry và control-flow; đủ tốt để clone hành vi, nhưng chưa chứng minh byte-for-byte mọi nhánh.
- **⚠️ Unresolved** — chưa nên hard-code nếu mục tiêu là giống stock tuyệt đối.

**Quan trọng:** các địa chỉ như `0x15980`, `0x28CF0` trong tài liệu là offset/RVA-like trong **unpacked logical code stream dùng cho RE**, **không phải file offset của EXE UPX gốc**.

---

# 1. Thông tin binary

| Thuộc tính | Kết quả |
|---|---|
| File | `HEROMusicServe.exe` |
| SHA-256 | `73f264a2909432766f95e0995c2e1c923c504dfa4a98345387335e129d0619b9` |
| PE | PE32, Intel i386 / x86 32-bit |
| Subsystem | Windows GUI |
| Windows subsystem version | 6.0 |
| Packer | UPX, version string `4.24` |
| Packed sections | 3 section; có `UPX0`, `UPX1`, `UPX!` |
| Packed entry point | RVA `0x00C7F160` |
| Image base | `0x00400000` |
| PE timestamp | `Fri May 15 02:30:03 2026` |
| Product/File version | `1.0.2.8` |
| FileDescription | `Shenzhen Beiying Technology` |
| Copyright | `2024-2030 Shenzhen Beiying Technology Co., LTD.` |
| Framework | Qt/C++, Qt 5.7.1 |
| Chức năng chính | Windows audio loopback → LED effect → HID reports |

### 1.1 Sau khi unpack

Code gốc có các section tiêu biểu:

```text
.text
.rdata
.data
.qtmetad
_RDATA
.rsrc
.reloc
```

Original entry trong workspace sau unpack nằm quanh `0x80AA3D`.

### 1.2 String/network đáng chú ý

Binary chứa chuỗi update/config:

```text
http://120.79.152.79/Audio_Config/config.ini
```

Đây chỉ là **embedded URL được xác nhận có trong binary**; tài liệu không giả định server hiện vẫn còn hoạt động hay response hiện tại giống build này.

---

# 2. Kiến trúc tổng thể

## 2.1 Các class chính đã thấy trong RTTI/string

```text
AudioMonitor
AudionDataToUsbThread
QAudionDrawThread
QAudioEffctBass
QAudion_Blooming_Passion
QAudion_Clouds_Rise_And_Snow_Fly
QAudion_Dazzling_Rock
QAudion_Effct_off
QAudion_Light_Field_Change
QAudion_The_Gurgling_Stream
QAudio_Dynamic_Spectrum
QTapeEffct
QWebSocketServer
```

### Vai trò suy ra từ code

```text
Windows render endpoint
       │
       ▼
AudioMonitor
       │  PCM / sample window
       ▼
Audio analysis
 ├─ common envelope analyzer 0x29740
 └─ Dynamic Spectrum Visualizer subsystem riêng
       │
       ▼
Effect engine
       │
       ├─ per-key Frame[0x208]
       │        │
       │        ▼
       │   color-group encoder 0x178A0
       │        │
       │        ▼
       │   HID packetizer 0x28CF0
       │
       └─ global RGB command 0x184B0 / 0x29010
                │
                ▼
        HID WriteFile / overlapped I/O
```

`QWebSocketServer` là local/control layer cho UI/driver khác điều khiển service.

---

# 3. Audio capture

## 3.1 Nguồn âm thanh

✅ Các string xác nhận:

```text
Default Loopback Device
render_audio
WAVE_FORMAT_PCM
IMMDeviceCollection
AudioMonitor.cpp
```

Thiết kế chính là **Windows render/loopback audio**, tức âm thanh đang phát ra loa/headphone, không phải micro mặc định.

## 3.2 Cách viết lại bằng WASAPI

Một EXE mới không cần Qt. Có thể dùng Core Audio trực tiếp:

1. `CoInitializeEx`.
2. `IMMDeviceEnumerator`.
3. `GetDefaultAudioEndpoint(eRender, eConsole)`.
4. Activate `IAudioClient`.
5. Initialize với `AUDCLNT_STREAMFLAGS_LOOPBACK`.
6. Lấy `IAudioCaptureClient`.
7. Gộp sample thành window khoảng 30 ms.
8. Convert stereo/multichannel thành mono analyzer stream.

Khuyến nghị event-driven capture để không busy-loop.

### C++ skeleton

```cpp
// Pseudocode / skeleton, không phải full error handling.
CoInitializeEx(nullptr, COINIT_MULTITHREADED);

ComPtr<IMMDeviceEnumerator> en;
CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL,
                 IID_PPV_ARGS(&en));

ComPtr<IMMDevice> dev;
en->GetDefaultAudioEndpoint(eRender, eConsole, &dev);

ComPtr<IAudioClient> client;
dev->Activate(__uuidof(IAudioClient), CLSCTX_ALL, nullptr,
              reinterpret_cast<void**>(client.GetAddressOf()));

WAVEFORMATEX* mix = nullptr;
client->GetMixFormat(&mix);

client->Initialize(
    AUDCLNT_SHAREMODE_SHARED,
    AUDCLNT_STREAMFLAGS_LOOPBACK,
    0, 0, mix, nullptr
);

ComPtr<IAudioCaptureClient> capture;
client->GetService(IID_PPV_ARGS(&capture));
client->Start();
```

**⚠️ Chưa xác nhận chính xác** stock convert PCM/float → `double[]` theo scale nào trước analyzer. Vì vậy đừng giả định raw input common analyzer luôn ở `[-1,1]`.

---

# 4. Nhịp xử lý

Trong profile embedded:

```ini
GrabAudioTime=30
```

và:

```ini
[AudioParam]
GrabAudioTime=35
```

=> engine được thiết kế quanh khoảng **30–35 ms mỗi chu kỳ effect**, tương đương xấp xỉ **28–33 update/s**.

Đây là **effect/render cadence**, không phải bằng chứng HID polling = 30 Hz.

Một clone nên:

- Capture audio liên tục/event-driven.
- Analyzer tích lũy window.
- Renderer chạy ~30 ms/tick.
- USB thread dùng queue kiểu **latest frame wins**, tránh backlog gây LED trễ theo nhạc.

---

# 5. Common audio level extractor — hàm `0x29740`

Các mode `169/170/171/172/173` gọi chung hàm này.

## 5.1 Hành vi xác nhận

Input logic:

```cpp
double* samples;
int count;
```

Hàm:

1. Duyệt sample.
2. Theo dõi **maximum positive sample**.
3. Đồng thời có theo dõi minimum, nhưng minimum không tham gia giá trị cuối quan trọng.
4. Tính arithmetic mean toàn bộ sample window.
5. Nếu positive peak khác 0, trả gần như:

```text
level = positive_peak - mean
```

Nếu không có positive peak hợp lệ → ~0.

## 5.2 Clone đơn giản

```cpp
double stockEnvelope(const double* x, int n)
{
    if (!x || n <= 0) return 0.0;

    double peak = 0.0;
    double sum = 0.0;

    for (int i = 0; i < n; ++i) {
        if (x[i] > peak)
            peak = x[i];
        sum += x[i];
    }

    if (peak == 0.0)
        return 0.0;

    const double mean = sum / n;
    return peak - mean;
}
```

## 5.3 Ý nghĩa

Đây là **amplitude/envelope detector thiên về peak**, không phải frequency spectrum analyzer.

Nó phản ứng mạnh với transient/kick/beat vì positive peak thay đổi nhanh.

**Không được suy rộng kết luận này sang mode 428:** Dynamic Spectrum dùng subsystem riêng.

---

# 6. Danh sách mode

## 6.1 Keyboard/audio effect IDs

Embedded remark table trong các profile:

```text
168 = AUDIO_DANCE_SOFT
169 = DAZZLING_ROCK
170 = CLOUDS_RISE_AND_SNOW_FLY
171 = LIGHT_FIELD_CHANGE
172 = THE_GURGLING_STREAM
173 = BLOOMING_PASSION
180 = EFFCT_OFF
428 = DYNAMIC_SPECTRUM
```

Runtime WebSocket advertise:

```text
Typs:169,170,171,172,173,180,428
```

Sau pass 2, danh sách này có thể chia rất rõ:

| ID | Trạng thái trong build 1.0.2.8 | Bằng chứng |
|---:|---|---|
| 168 | **legacy metadata only / code bị loại** | có string/config, không có RTTI class, getter, dispatch hay live advertise |
| 169 | live | getter + class + update + renderer |
| 170 | live | getter + class + update + renderer |
| 171 | live | getter + class + global-RGB path |
| 172 | live | getter + class + history renderer |
| 173 | live | getter + class + pattern/shell renderer |
| 180 | live | getter + off/clear path |
| 428 | live | getter + Visualizer FFT subsystem |

## 6.2 ID getter xác nhận trực tiếp

Các hàm kiểu `mov eax, imm; ret` của class effect live:

| Getter (workspace) | Return | Class/mode |
|---:|---:|---|
| `0x11860` | 180 | Effect Off |
| `0x12C70` | 173 | Blooming Passion |
| `0x147B0` | 170 | Clouds Rise And Snow Fly |
| `0x15970` | 169 | Dazzling Rock |
| `0x16930` | 171 | Light Field Change |
| `0x16BB0` | 172 | The Gurgling Stream |
| `0x181A0` | 428 | Dynamic Spectrum |

Đã quét getter immediate trong vùng ID hợp lý và cross-check RTTI/class names. **Không có getter 168** và không có class `Dance/Soft` tương ứng.

## 6.3 Side/Tape IDs

Runtime:

```text
Typs_o:500,501,502,503
```

Các ID đều có nhánh dispatch trong `QTapeEffct`:

- `500`: audio callback no-op/không render rhythm.
- `501`: bar từ một đầu.
- `502`: bar bung từ tâm ra hai phía.
- `503`: global RGB phụ thuộc hướng rising/falling.

## 6.4 Không tìm thấy mode live ẩn khác

Pass 2 rà lại:

1. RTTI / class-name strings.
2. getter trả immediate trong range ID effect.
3. compare/dispatch quanh các factory/current-effect path.
4. embedded `TypN=` profile records.
5. WebSocket `Typs` và `Typs_o`.

Không thấy một keyboard rhythm mode live khác ngoài `169–173,180,428`, cũng không thấy side mode khác ngoài `500–503`.

Có **một profile embedded bị typo metadata** kiểu:

```text
Typ6=171:BLOOMING_PASSION:
```

trong khi code getter của Blooming chắc chắn trả **173**. Đây là lỗi dữ liệu/config của một profile, **không phải alias ID 171 cho Blooming**.

# 7. Device profile và một điều dễ nhầm

Nhiều embedded device profile có:

```ini
[DeviceConfig]
AudionCount=2
AudionTyp=169|428
```

Điều này nghĩa là:

- Engine **có code** cho nhiều mode.
- Nhưng profile stock của một số thiết bị chỉ **expose 169 và 428**.

Vì vậy việc UI chỉ hiện 2 music modes **không chứng minh engine chỉ có 2 mode**.

Một EXE riêng có thể gọi/clone các mode khác nếu protocol/geometry phù hợp với HERO68.

---

# 8. Frame RGB nội bộ

## 8.1 Kích thước

Renderer thường clear:

```text
0x208 = 520 bytes
```

Buffer dùng RGB theo key ID:

```text
offset = 3 * keyId
frame[offset + 0] = R
frame[offset + 1] = G
frame[offset + 2] = B
```

Key ID lưu trong geometry là `uint16_t`.

Transform `0x178A0` quét key IDs **1..121**.

`keyId=0` xuất hiện ở một số profile như placeholder/no-key và không nên coi là LED thật.

## 8.2 C++ representation

```cpp
struct RGB {
    uint8_t r, g, b;
};

using Frame = std::array<uint8_t, 0x208>;

void clearFrame(Frame& f)
{
    f.fill(0);
}

void setKey(Frame& f, uint16_t keyId, RGB c)
{
    if (keyId == 0 || keyId > 121)
        return;

    const size_t off = 3u * keyId;
    if (off + 2 >= f.size())
        return;

    f[off + 0] = c.r;
    f[off + 1] = c.g;
    f[off + 2] = c.b;
}
```

---

# 9. Exact frame encoder — `0x178A0`

Đây là một trong các finding quan trọng nhất.

Stock **không gửi raw 121×RGB**.

Nó quét frame, bỏ các key màu đen, rồi **gom tất cả key có cùng 24-bit RGB thành group**.

## 9.1 Record format

Mỗi color group serialize thành:

```text
R
G
B
count
keyId[0]
keyId[1]
...
keyId[count-1]
```

Tức:

```text
[R G B N K1 K2 ... KN] [R G B N K1 ...] ...
```

### Ví dụ

Nếu key 10,11,12 đều đỏ và key 20,21 xanh:

```text
FF 00 00 03 0A 0B 0C
00 FF 00 02 14 15
```

## 9.2 Black handling

RGB `00 00 00` bị skip khỏi encoded stream.

Điều này cho thấy command frame dùng semantic “set frame/group” chứ không phải đơn giản gửi từng key change độc lập.

## 9.3 Clone encoder

Stock sử dụng Qt container/hash nên thứ tự group có thể phụ thuộc QHash internals. Thiết bị về logic không nên cần đúng order màu; nếu cần **wire-identical** tuyệt đối phải emulate Qt 5.7 QHash order.

Một encoder deterministic dễ dùng:

```cpp
std::vector<uint8_t> encodeFrame(const Frame& f)
{
    struct Group {
        RGB color;
        std::vector<uint8_t> keys;
    };

    std::vector<Group> groups;

    for (uint16_t id = 1; id <= 121; ++id) {
        const size_t off = 3u * id;
        RGB c { f[off], f[off + 1], f[off + 2] };

        if (c.r == 0 && c.g == 0 && c.b == 0)
            continue;

        auto it = std::find_if(groups.begin(), groups.end(), [&](const Group& g) {
            return g.color.r == c.r && g.color.g == c.g && g.color.b == c.b;
        });

        if (it == groups.end()) {
            groups.push_back({c, {}});
            it = std::prev(groups.end());
        }

        it->keys.push_back(static_cast<uint8_t>(id));
    }

    std::vector<uint8_t> out;

    for (const auto& g : groups) {
        // HERO geometry nhỏ hơn 255 key, nên count 1 byte đủ.
        out.push_back(g.color.r);
        out.push_back(g.color.g);
        out.push_back(g.color.b);
        out.push_back(static_cast<uint8_t>(g.keys.size()));
        out.insert(out.end(), g.keys.begin(), g.keys.end());
    }

    return out;
}
```

---

# 10. Exact HID packetizer — `0x28CF0`

Encoder stream được cắt thành **tối đa 56 byte payload/report**.

## 10.1 64-byte report layout

```text
byte 00 : report/device byte = field hidObject+0x3C
byte 01 : command family
          0x08 = keyboard
          0x0E = side/tape
byte 02 : 0x01
byte 03 : 0x00
byte 04 : total packet count
byte 05 : packet index (0-based)
byte 06 : payload length (0..56)
byte 07..62 : payload (max 56 bytes), rest zero
byte 63 : checksum
```

Do đó keyboard per-key frame có header:

```text
?? 08 01 00 TOTAL INDEX LEN ... CHECKSUM
```

Side/tape frame:

```text
?? 0E 01 00 TOTAL INDEX LEN ... CHECKSUM
```

## 10.2 Packet count

```cpp
packetCount = (encodedSize + 55) / 56;
```

Record có thể bị cắt ngang giữa hai HID report vì packetizer đơn giản chunk byte stream; firmware phải reassemble/parse state qua packet boundaries.

## 10.3 Checksum — hàm `0x6E40`

Exact:

```cpp
packet[63] = uint8_t(0xFFu - sum(packet[0..62]));
```

Tương đương invariant:

```text
(sum(packet[0..63]) & 0xFF) == 0xFF
```

## 10.4 C++ packetizer

```cpp
using Report64 = std::array<uint8_t, 64>;

uint8_t checksum64(const Report64& p)
{
    uint32_t s = 0;
    for (size_t i = 0; i < 63; ++i)
        s += p[i];
    return static_cast<uint8_t>(0xFFu - s);
}

std::vector<Report64> packetize(
    const std::vector<uint8_t>& stream,
    uint8_t reportByte,
    bool tape)
{
    constexpr size_t CHUNK = 56;
    const size_t total = (stream.size() + CHUNK - 1) / CHUNK;

    std::vector<Report64> result;
    result.reserve(total);

    for (size_t index = 0; index < total; ++index) {
        Report64 p{};

        const size_t begin = index * CHUNK;
        const size_t len = std::min(CHUNK, stream.size() - begin);

        p[0] = reportByte;
        p[1] = tape ? 0x0E : 0x08;
        p[2] = 0x01;
        p[3] = 0x00;
        p[4] = static_cast<uint8_t>(total);
        p[5] = static_cast<uint8_t>(index);
        p[6] = static_cast<uint8_t>(len);

        std::copy_n(stream.begin() + begin, len, p.begin() + 7);
        p[63] = checksum64(p);

        result.push_back(p);
    }

    return result;
}
```

**⚠️** Stock function memset vùng lớn hơn 64 byte nhưng checksum nằm ở byte 63 và target protocol là 64-byte report. Khi viết EXE riêng, đọc `OutputReportByteLength` từ HID caps; với target này cần tối thiểu 64 byte.

---

# 11. Direct global RGB packet

Một số mode không gửi per-key groups mà dùng một global color command.

## 11.1 Keyboard — `0x184B0`

```text
byte 00 = report/device byte
byte 01 = 0x08
byte 02 = 0x02
byte 03 = 0x00
byte 04 = 0x01
byte 05 = 0x00
byte 06 = 0x03
byte 07 = R
byte 08 = G
byte 09 = B
...
byte 63 = checksum
```

Header dễ nhận dạng:

```text
?? 08 02 00 01 00 03 RR GG BB ... CS
```

## 11.2 Side/tape — `0x29010`

Giống trên nhưng byte 1 là `0x0E`:

```text
?? 0E 02 00 01 00 03 RR GG BB ... CS
```

## 11.3 C++ helper

```cpp
Report64 globalRgb(uint8_t reportByte, bool tape, RGB c)
{
    Report64 p{};
    p[0] = reportByte;
    p[1] = tape ? 0x0E : 0x08;
    p[2] = 0x02;
    p[3] = 0x00;
    p[4] = 0x01;
    p[5] = 0x00;
    p[6] = 0x03;
    p[7] = c.r;
    p[8] = c.g;
    p[9] = c.b;
    p[63] = checksum64(p);
    return p;
}
```

---

# 12. HID transport

Stock cuối cùng đi qua Win32 `WriteFile` và có xử lý overlapped I/O / `ERROR_IO_PENDING (997)`.

Một clone nên:

1. Enumerate HID interface với SetupAPI.
2. `CreateFile(... FILE_FLAG_OVERLAPPED ...)`.
3. `HidD_GetAttributes`, Product/Manufacturer/Serial nếu cần match.
4. `HidP_GetCaps` để lấy `OutputReportByteLength`.
5. Giữ handle mở suốt khi effect chạy.
6. Một USB thread duy nhất serializes writes.
7. Với `WriteFile == FALSE` và `GetLastError()==ERROR_IO_PENDING`, chờ event rồi `GetOverlappedResult`.

**Không invent VID/PID:** build này có multi-device profile; VID/PID target HERO68 nên lấy từ device enumeration/capture hiện tại của chính máy.

---

# 13. Geometry parser

Config dùng dạng:

```ini
Index_numble=11
RowButton_1="36"
RowButton_2="35,49,50,37,22,23"
...
```

Blooming đặc biệt có nhiều shell trong một entry:

```text
RowButton_1="31|17,18,...|16,29,...|..."
```

Parser nên hỗ trợ:

```cpp
using KeyGroup = std::vector<uint16_t>;
using GroupList = std::vector<KeyGroup>;
using BloomPattern = GroupList;        // shell 0..N-1
using BloomPatterns = std::vector<BloomPattern>;
```

### Parse comma list

```cpp
std::vector<uint16_t> parseKeys(std::string_view s);
```

### Parse `|` shell list

```cpp
BloomPattern parseBloomPattern(std::string_view s)
{
    BloomPattern result;
    for (auto shellText : split(s, '|'))
        result.push_back(parseKeys(shellText));
    return result;
}
```

---

# 14. MODE 169 — Dazzling Rock

**Class:** `QAudion_Dazzling_Rock`  
**ID getter:** `169` (`0x15970`)  
**Update:** quanh `0x15980`  
**Renderer:** quanh `0x15A90`  
**Analyzer:** common envelope `0x29740`

## 14.1 Hình học

Profile chứa danh sách ring từ tâm ra ngoài. Ví dụ 11 ring:

```text
Ring 1  : 36
Ring 2  : 35,49,50,37,22,23
Ring 3  : 21,34,48,24,38,51,61,62,63
...
Ring 11 : 101,81,82,83,84
```

Không phải distance được tính realtime; **topology đã precompute trong profile**. EXE chỉ chọn bao nhiêu ring sẽ bật.

## 14.2 Audio → target level

Stock lấy:

```text
raw = commonEnvelope(samples)
scale = byte[this+0x81]
```

sau đó tạo target bằng modulo/quantization kiểu stock. Control-flow nhánh này có quirk quotient low-byte:

```cpp
q = int(raw / scale);
if ((uint8_t)q != 0)
    target = raw - (uint8_t(q) * scale);
else
    target = raw;
```

Không hard-code `scale=8` cho clone multi-device; constructor/base init và profile/device setup có thể sửa byte này.

## 14.3 Temporal state

Previous/visible level nằm quanh `[this+0x78]`.

```cpp
if (prev > target)
    next = prev - 1.0;
else
    next = prev + 1.0;

if (next < 0.0)
    next = 0.0;
```

Điểm lạ nhưng xác nhận: stock **không clamp thẳng tới target**, vì vậy có thể dao động ±1 quanh target.

## 14.4 Renderer

Số ring active xấp xỉ:

```cpp
N = floor(level);
N = min(N, ringCount);
```

Các ring từ `0..N-1` được fill. Fixed-color dùng màu cấu hình; multicolor lấy màu từ palette helper chung.

### Wavefront trắng

Chi tiết signature của Dazzling:

- `N > 1`: **ring ngoài cùng đang active** bị force white `(255,255,255)`.
- `N == 1`:
  - flag nội bộ bật → white;
  - flag tắt → base/palette color × **0.3**.

`0.3` là constant có thật trong binary.

## 14.5 Palette cadence — đã chốt

Shared palette là queue QColor. Helper advance thực hiện chính xác:

```text
front → remove → append to back
```

Dazzling có counter `[+0x88]`; multicolor advance khoảng **mỗi 3 effect update**:

```cpp
if (paletteCounter == 2) {
    rotateFrontToBack();
    paletteCounter = 0;
}
++paletteCounter;
```

## 14.6 Clone gần stock

```cpp
void DazzlingRock::tick(const AudioWindow& a)
{
    double raw = stockEnvelope(a.samples.data(), a.samples.size());
    double target = dazzModuloQuirk(raw, scaleByte);

    if (level > target) level -= 1.0;
    else                level += 1.0;
    if (level < 0.0) level = 0.0;

    Frame frame{};
    int n = std::clamp((int)level, 0, (int)rings.size());

    for (int r = 0; r < n; ++r) {
        RGB c = multicolor ? paletteColorForRing(r) : base;

        if (r == n - 1) {
            if (n > 1 || firstRingWhiteFlag)
                c = {255,255,255};
            else
                c = scaleRgbByteSemantics(c, 0.3);
        }

        for (uint8_t key : rings[r])
            setKey(frame, key, c);
    }

    sendPerKeyFrame(frame);

    if (multicolor) {
        if (paletteCounter == 2) {
            rotatePaletteFrontToBack();
            paletteCounter = 0;
        }
        ++paletteCounter;
    }
}
```

Độ hoàn thiện: **cao**. Phần còn phụ thuộc device/profile chủ yếu là scale/init flag, không phải shape algorithm.

# 15. MODE 170 — Clouds Rise And Snow Fly

**Class:** `QAudion_Clouds_Rise_And_Snow_Fly`  
**ID:** 170 (`0x147B0`)  
**Update:** `0x147C0`  
**Renderer:** `0x14890`  
**Analyzer:** common envelope

Pass 2 chốt được state machine và gradient cụ thể hơn đáng kể.

## 15.1 Geometry

Profile chia keyboard thành các physical rows. Thường 5–6 row tùy layout. Shape không được phát hiện runtime; nó đọc `RowButton_i` từ profile.

## 15.2 Audio level update — exact core

```text
raw = commonEnvelope(samples)
scale = byte[this+0x90]
target = raw modulo/quantized by scale
```

Previous double ở khoảng `+0x88`.

Attack/release:

```cpp
if (prev > target)
    next = prev - 1.0; // release từng 1
else
    next = target;     // attack gần như tức thời

if (next < 0.1)
    next = 0.0;
```

`0.1` là double constant xác nhận trực tiếp.

## 15.3 Moving phase

Renderer có phase/state chạy độc lập với amplitude. Mỗi render phase tăng rồi wrap min/max. Vì vậy cùng một level nhưng cloud band vẫn trôi.

## 15.4 Active span

Với mỗi physical row:

```text
activeCount ≈ floor((rowCount / byte[this+0x91]) * level)
```

Sau đó clamp theo row size. Byte `+0x91` là layout/effect scale riêng; nên lấy từ init/profile thay vì hard-code.

## 15.5 Gradient chính xác hơn

Ở orientation chính, với `activeCount = A` và vị trí `i` trong vùng active, mỗi channel dùng dạng tuyến tính:

```cpp
out = base - (base / (2.0 * A)) * i;
```

hay tương đương:

```text
factor(i) = 1 - i/(2A)
```

Vì vậy đầu dải sáng nhất và càng đi sâu càng tối dần.

Ngoài gradient chính, quanh moving phase boundary có các vị trí bị tạo **shadow edge**:

```cpp
edge = max(baseChannel - 80, 0);
```

`80 (0x50)` là literal trong code.

## 15.6 Layout/orientation branch

Renderer đọc device/layout byte quanh `device+0x40`.

- Value `2` hoặc `3` đi nhánh orientation đặc biệt.
- Nhánh này không áp dụng gradient giống hệt normal path; một số key được ghi nguyên base/palette color.

Điều này lý giải vì sao clone chỉ đảo row trái-phải có thể chưa giống stock trên model khác.

## 15.7 Palette

Mode dùng shared palette helper. Trong normal render path, palette có thể advance **mỗi render frame** khi multicolor bật; không dùng cadence 3/20 như Dazzling/Gurgling.

## 15.8 Clone gần stock

```cpp
void Clouds::tick(const AudioWindow& a)
{
    double raw = stockEnvelope(a.samples.data(), a.samples.size());
    double target = stockModuloLike(raw, levelScale);

    if (level > target) level -= 1.0;
    else                level = target;
    if (level < 0.1) level = 0.0;

    phase++;
    if (phase > phaseMax) phase = phaseMin;

    Frame f{};

    for (int r = 0; r < rows.size(); ++r) {
        auto &row = rows[r];
        int A = (int)((double(row.size()) / rowScale) * level);
        A = std::clamp(A, 0, (int)row.size());
        if (!A) continue;

        RGB baseNow = multicolor ? currentPaletteColor(r) : base;

        for (int i = 0; i < A; ++i) {
            int logicalPos = specialOrientation
                ? specialMapPosition(row, i, phase)
                : normalMapPosition(row, i, phase);

            RGB c = baseNow;
            if (!specialOrientation) {
                const double factor = 1.0 - double(i)/(2.0*A);
                c = scaleRgbStock(c, factor);
                if (isStockShadowEdge(i, phase, A))
                    c = subtractClamp(c, 80);
            }

            setKey(f, row[logicalPos], c);
        }
    }

    sendPerKeyFrame(f);
    if (multicolor) rotatePaletteFrontToBack();
}
```

**Còn một ambiguity nhỏ:** exact index transform của orientation special cho mọi profile. Audio state + gradient + shadow edge đã khá chắc.

# 16. MODE 171 — Light Field Change

**Class:** `QAudion_Light_Field_Change`  
**ID:** 171  
**Core:** quanh `0x16940`  
**Analyzer:** common envelope

Mode này khác hẳn các mode per-key: nó dùng **global RGB packet**.

## 16.1 Audio scale

Ngay sau common analyzer:

```text
level *= 0.01
```

Constant `0.01` được xác nhận.

## 16.2 Rise/fall detector

State:

- previous audio level: `[this+0x180]`
- integer accumulator: `[this+0x178]`

Logic:

```cpp
if (current > previous)
    accumulator += 10;
else
    accumulator = int(accumulator * 0.6);
```

Constants:

- attack increment = **10**
- decay multiplier = **0.6**

## 16.3 RGB generation stock

Base channels nằm quanh fields `+0x29/+0x2A/+0x2B`.

Code tạo argument cho global keyboard packet như sau:

```cpp
uint8_t phase = uint8_t(accumulator);

Rout = uint8_t(baseR + phase);
Bout = uint8_t(baseB + phase);

if (current > previous)
    Gout = baseG;
else
    Gout = baseB + accumulator;
```

Sau đó gọi global packet `0x184B0`.

Do byte arithmetic, một số phép cộng **wrap modulo 256** thay vì saturating clamp.

Nếu mục tiêu giống stock tuyệt đối, giữ wrap. Nếu muốn visual sạch hơn, `std::clamp` là thay đổi riêng.

## 16.4 Ý nghĩa thị giác

Mode không vẽ shape per-key. Toàn bộ light field đổi màu theo **audio rising/falling state**:

- transient tăng → phase nhảy +10;
- lúc không tăng → phase rơi ×0.6;
- R/B và một nhánh G thay đổi theo phase.

## 16.5 Exact-ish clone

```cpp
void LightField::tick(const AudioWindow& a)
{
    double cur = stockEnvelope(...) * 0.01;

    if (cur > prev)
        phase += 10;
    else
        phase = int(double(phase) * 0.6);

    uint8_t p = static_cast<uint8_t>(phase);

    RGB out;
    out.r = uint8_t(base.r + p);
    out.b = uint8_t(base.b + p);
    out.g = (cur > prev)
          ? base.g
          : uint8_t(base.b + phase);

    writeReport(globalRgb(reportByte, false, out));
    prev = cur;
}
```

---

# 17. MODE 172 — The Gurgling Stream

**Class:** `QAudion_The_Gurgling_Stream`  
**ID:** 172 (`0x16BB0`)  
**Core:** quanh `0x16BD0`  
**Analyzer:** common envelope

## 17.1 Geometry = stream columns

Ví dụ profile có `Index_numble=19`:

```text
Column 1  = 67,55,42,28,14,1
Column 2  = 68,56,43,29,15,2
...
Column 19 = 83,82,81,101
```

Mỗi group là một cột/đường theo hình học bàn phím.

## 17.2 Audio target

Default scale byte ở `+0x90` thấy giá trị 5 trong constructor/init.

```cpp
raw = stockEnvelope(...);
q = int(raw / scale);
target = raw - q*scale;
```

## 17.3 Smoothing

```cpp
if (level > target)      level -= 1.0;
else if (level < target) level += 1.0;
if (level < 0.0) level = 0.0;
```

## 17.4 History queue — pass 2 sửa hướng chính xác

Bản trước chỉ mô tả “shift một đầu”. Disassembly helper đã chốt thứ tự:

```cpp
history.pop_back();
history.push_front(uint8_t(level));
```

Tức:

- `history[0]` = mức **mới nhất**.
- index tăng dần = mức **cũ hơn**.
- nếu column loop đi `0 → N-1`, waveform mới xuất hiện ở column đầu rồi trôi dần sang các column sau.

Đây là chi tiết cần đúng nếu muốn hướng dòng nước giống stock.

## 17.5 Renderer

```cpp
for (int x=0; x<columnCount; ++x) {
    int h = history[x];
    h = min(h, (int)columns[x].size());

    for (int y=0; y<h; ++y) {
        RGB c = colorForColumn(x);
        if (y + 1 == h)
            c = stockByteScale(c, 1.3);
        setKey(frame, columns[x][y], c);
    }
}
```

### Crest/highlight

Phím trên cùng của cột active được scale **×1.3**. Literal `1.3` đã xác nhận.

Nếu channel vượt 255, cần lưu ý stock đi qua byte conversion; clone byte-identical nên bắt chước semantics thay vì saturating theo cảm tính.

## 17.6 Palette cadence — exact

Shared palette rotate front→back khoảng **mỗi 20 audio/effect update** khi multicolor bật.

## 17.7 Clone

```cpp
void Gurgling::tick(const AudioWindow& a)
{
    double raw = stockEnvelope(a.samples.data(), a.samples.size());
    double target = stockModuloLike(raw, levelScale);

    if (level > target) --level;
    else if (level < target) ++level;
    if (level < 0) level = 0;

    if (!history.empty()) {
        history.pop_back();
        history.push_front((uint8_t)level);
    }

    Frame f{};
    for (size_t x=0; x<columns.size() && x<history.size(); ++x) {
        int h = std::min<int>(history[x], columns[x].size());
        RGB c0 = multicolor ? paletteForColumn(x) : base;
        for (int y=0; y<h; ++y) {
            RGB c = (y+1 == h) ? stockByteScale(c0, 1.3) : c0;
            setKey(f, columns[x][y], c);
        }
    }
    sendPerKeyFrame(f);

    if (multicolor && ++paletteTick >= 20) {
        rotatePaletteFrontToBack();
        paletteTick = 0;
    }
}
```

Độ hoàn thiện: **rất cao** cho core visual.

# 18. MODE 173 — Blooming Passion

**Class:** `QAudion_Blooming_Passion`  
**ID:** 173 (`0x12C70`)  
**Update:** `0x12C80`  
**Renderer:** `0x12E00`  
**Pattern-step helper:** `0x14050`  
**Analyzer:** common envelope

## 18.1 Geometry

Khác Dazzling chỉ có một set concentric rings, Blooming có **nhiều pattern**, mỗi pattern lại chứa nhiều shell phân cách bằng `|`.

Ví dụ:

```text
Pattern 1:
  shell0 = "31"
  shell1 = "17,18,32,45,30,44"
  shell2 = "16,29,43,..."
  ...
```

Profile mẫu có `Index_numble=8` → 8 bloom centers/patterns.

## 18.2 Level quantization

```text
raw = commonEnvelope(samples)
divisor = byte[this+0x84]   // default/init thấy 99
target = modulo-like(raw, divisor)
```

Visible level ở `this+0x50` tiến tới target đúng kiểu ±1:

```cpp
if (level > target) level -= 1.0;
else if (level < target) level += 1.0;
```

## 18.3 Pattern rotation — pass 2 chốt: KHÔNG RANDOM

Counter khoảng `+0x78`; current pattern quanh `+0x79`.

Khi counter vượt 10, helper `0x14050(cur,count)` chạy. Helper này về logic:

```cpp
int nextPattern(int cur, int count)
{
    if (cur == count - 1) return 0;
    return cur + 1;
}
```

=> pattern đổi **round-robin deterministic**:

```text
0 → 1 → 2 → ... → count-1 → 0 → ...
```

Khoảng mỗi **11 update** stock copy shell vector của pattern kế tiếp sang active pattern.

Vì thế nếu clone dùng random center sẽ nhìn khác stock theo thời gian dù từng bloom riêng lẻ đúng.

## 18.4 Multicolor cadence

Blooming gọi shared palette rotate **mỗi audio update** khi multicolor bật — nhanh hơn Dazzling và Gurgling.

## 18.5 Renderer

Frame được clear trước. Với `level = L`:

```text
fullShells = floor(L)
frac = L - floor(L)
```

- shell `< fullShells`: full base/palette color.
- shell dẫn đầu/fractional: mỗi channel dùng công thức xác nhận:

```cpp
out = int(baseChannel * frac + 90.0);
```

`90.0` là literal double trong code.

Điểm đáng chú ý: `+90` làm shell leading không biến mất hoàn toàn khi frac nhỏ; nó tạo viền bloom sáng.

## 18.6 Sleep/render cadence

Renderer có `Sleep(10 ms)` sau xử lý/send path. Đây là throttle riêng của mode, ngoài capture/effect timer tổng.

## 18.7 Clone gần stock

```cpp
void Blooming::tick(const AudioWindow& a)
{
    double raw = stockEnvelope(a.samples.data(), a.samples.size());
    double target = stockModuloLike(raw, divisor);

    if (level > target) level -= 1.0;
    else if (level < target) level += 1.0;

    if (multicolor)
        rotatePaletteFrontToBack();

    if (++patternTick > 10) {
        patternIndex = (patternIndex == patterns.size()-1)
                     ? 0 : patternIndex + 1;
        activeShells = patterns[patternIndex];
        patternTick = 0;
    }

    Frame f{};
    int full = std::max(0, (int)std::floor(level));
    double frac = level - std::floor(level);

    for (int s=0; s<activeShells.size(); ++s) {
        if (s > full) break;
        RGB baseNow = multicolor ? paletteForShell(s) : base;
        RGB c;
        if (s < full) {
            c = baseNow;
        } else {
            c = {
                uint8_t(int(baseNow.r*frac + 90.0)),
                uint8_t(int(baseNow.g*frac + 90.0)),
                uint8_t(int(baseNow.b*frac + 90.0))
            };
        }
        for (uint8_t key : activeShells[s])
            setKey(f, key, c);
    }

    sendPerKeyFrame(f);
    Sleep(10);
}
```

Độ hoàn thiện: **rất cao**; phần “pattern random?” của bản cũ đã được loại bỏ hoàn toàn.

# 19. MODE 180 — Effect Off

**Class:** `QAudion_Effct_off`  
**ID:** 180

Mode 180 không phải visualizer riêng; nó là stop/off path.

Binary có các semantic strings/hàm dạng:

```text
SoftwareClearDisp
Audio_Run_End
stop
```

Dynamic clear helper cũng xác nhận packet global RGB `(0,0,0)` là valid clear path.

## Clone khuyến nghị

Khi chọn Off:

1. Dừng effect renderer.
2. Bỏ queued frames cũ.
3. Send keyboard global RGB black:

```text
?? 08 02 00 01 00 03 00 00 00 ... checksum
```

4. Nếu side mode đang active và cần tắt side:

```text
?? 0E 02 00 01 00 03 00 00 00 ... checksum
```

5. Có thể giữ WASAPI capture mở nếu muốn switch mode nhanh, hoặc release hoàn toàn nếu đúng semantics `stop`.

---

# 20. MODE 168 — Audio Dance Soft

Embedded metadata có:

```text
168:AUDIO_DANCE_SOFT
```

Sau pass 2, trạng thái của mode 168 có thể kết luận mạnh hơn: **implementation không còn nằm trong build HEROMusicServe 1.0.2.8 đang phân tích**.

## 20.1 Những gì đã rà

- Runtime `Typs` không advertise 168.
- Không có getter `mov eax,168; ret` kiểu các live effect.
- Không có RTTI/class name `QAudion_*Dance*` / `*Soft*` tương ứng.
- Không thấy dispatch/factory branch nhận 168 trong live effect set.
- Quét embedded `TypN` chỉ thấy nó trong **remark/config metadata**.
- Class live bắt đầu rõ từ Off/Blooming/Clouds/Dazzling/Light/Gurgling/Dynamic, không có một code region bị bỏ tên hợp lý cho 168.

## 20.2 Kết luận thực dụng

Đây không còn là “mode chưa RE xong” trong file hiện tại; nó là **dead/legacy token**. Không thể khôi phục thuật toán stock 168 từ một implementation không tồn tại trong binary.

Muốn 168 byte-/visual-faithful cần một trong:

1. HEROMusicServe/driver version cũ còn expose 168.
2. Một OEM/rebrand build dùng cùng engine nhưng giữ class 168.
3. Runtime capture từ máy có service version đó.

Không nên gán “soft dance” thành một envelope/pulse tự nghĩ rồi gọi là stock 168. Nếu muốn có mode 168 trong EXE riêng ngay bây giờ, hãy đặt tên rõ `168-compatible replacement`/`Soft Dance custom`, tách khỏi stock clone.

# 21. MODE 428 — Dynamic Spectrum

**Class:** `QAudio_Dynamic_Spectrum`  
**ID:** 428 (`0x181A0`)  
**Keyboard renderer:** quanh `0x181B0`  
**Visualizer singleton/init:** quanh `0x1AAB0` / constructor `0x1ADB0`  
**FFT/window helpers:** `0x19090`, `0x19400`, `0x194A0`, `0x19540`  
**Main analyzer:** quanh `0x1B550`  
**Field compositor:** quanh `0x1BB20`

Đây là phần lớn nhất được hoàn tất ở RE pass 2. **Stock 428 thực sự là FFT spectrum analyzer**, không phải scalar envelope và cũng không phải “22 band FFT replacement” như bản tài liệu trước từng đề xuất.

## 21.1 Pipeline stock chính xác ở mức kiến trúc

```text
WASAPI loopback capture
  ↓
prepare/aggregate capture samples
  ↓
input sensitivity scale (`db * 30`)
  ↓
256-point selected window
  ↓
256-point complex FFT
  ↓
first 64 frequency bins
  ↓
magnitude nonlinear curve
  ↓
peak-hold/release state
  ↓
expand each bin ×4 → 256 horizontal spectrum values
  ↓
spatial smoothing across x
  ↓
temporal smoothing
  ↓
256×64 color field compositor
  ↓
keyboard samples field at 22×6 coordinates
  ↓
logical cell → physical key → RGB frame
  ↓
normal per-key encoder/HID packets
```

## 21.2 FFT size và input structure

FFT size là **256**.

Main analyzer chuẩn bị block tương đương **256 complex pairs / 512 floats = 2048 bytes** rồi gọi window + in-place FFT.

Trong visible preparation path, stock lấy nhóm 4 float capture values, cộng lại rồi scale:

```cpp
x = (s0 + s1 + s2 + s3) * 0.25f * 2.0f * inputScale;
```

với:

```text
inputScale = visualizer[+0x408]
```

Code ghi cùng scalar vào hai slot kế nhau của working pair trước FFT. Vì sample/channel layout của capture object chưa bóc đến format descriptor cuối cùng, **ý nghĩa vật lý của 4 float** (stereo frames/interleaved stage nào) vẫn là một trong số ít chi tiết chưa chốt. Nếu clone exact control-flow trước, giữ phép aggregate 4-float như trên.

## 21.3 `db` stock = input sensitivity, không phải display threshold

WebSocket/config handler `on_ChangeDB` parse integer `db`, lấy Visualizer singleton rồi ghi:

```cpp
visualizer->inputScale = db * 30;
```

Disassembly thực hiện `db*16 - db`, rồi ×2 = **db×30**.

Ví dụ profile:

```ini
db=35
```

→ internal scale:

```text
35 × 30 = 1050
```

Một profile khác có `db=38` → 1140.

Constructor default `+0x408=2000` chỉ là pre-config default; khi config được apply nó bị thay bằng `db*30`.

Do preparation còn nhân `0.25×2 = 0.5`, contribution ngay tại block aggregate là:

```text
sum4 × db × 15
```

với db=35 → `sum4 × 525`.

**Correction quan trọng:** field `+0x50434=70` không phải DB. Nó là intensity của **background palette**.

## 21.4 Window functions — exact

Selector ở `+0x414`, default = `1`.

| selector | window | công thức stock |
|---:|---|---|
| 1 | Hann | `0.5 * (1 - cos(2πn/N))` |
| 2 | Hamming | `0.54 - 0.46*cos(2πn/N)` |
| 3 | Blackman | `0.42 - 0.5*cos(2πn/N) + 0.08*cos(4πn/N)` |
| khác | none/bypass | không nhân window tương ứng |

Helper regions:

- Blackman: `~0x19090`
- Hamming: `~0x19400`
- Hann: `~0x194A0`
- bit reversal: `~0x19030`
- butterfly FFT: `~0x19160`
- wrapper: `~0x19540`

Stock dùng π gần `3.14` trong một số helper/palette math.

## 21.5 Magnitude và nonlinear curve — exact core

Chỉ **64 bin đầu** (`k=0..63`) được biến thành spectrum display. Với mỗi bin:

```cpp
mag = sqrt(re*re + im*im);
v = 0.9f * mag + 0.5f * ln(1.1f * mag);
v = min(v, 1.0f);
```

Sau đó peak/release:

```cpp
oldPeak *= peakDecayPercent / 100.0f;
peak = max(oldPeak, v);
peak = max(peak, 0.0f);
```

Default constructor:

```text
peakDecayPercent = 50
```

=> state peak cũ bị nhân **0.5 mỗi analyzer update** trước khi so với magnitude mới.

Mỗi bin được lặp vào **4 x positions**:

```cpp
state[4*k + 0] = peak;
state[4*k + 1] = peak;
state[4*k + 2] = peak;
state[4*k + 3] = peak;
```

64 bins ×4 = **256 horizontal spectrum values**.

### Cẩn thận với `ln(0)`

Stock assembly/CRT behavior phụ thuộc float path. Clone nên dùng epsilon rất nhỏ để tránh NaN/`-inf` phá downstream, nhưng nếu muốn byte-behavior tối đa cần test capture silence thực tế.

## 21.6 Spatial smoothing — stock có 3 mode

Fields:

```text
+0x40C = smoothing mode (default 1)
+0x410 = radius/block width (default 8)
```

Observed behavior:

- mode `0`: block/group average, có xử lý boundary mirrored/special.
- mode `1` (**default**): centered moving average radius `r=8`; interior denominator xấp xỉ `2r+1`.
- mode khác: gần như no spatial smoothing/bypass.

Clone visual-faithful nên implement moving average radius 8 trước.

## 21.7 Temporal smoothing

Field:

```text
+0x50454 = temporal alpha
```

Update:

```cpp
display[i] += (state[i] - display[i]) * alpha;
```

Default `alpha=1.0` → mặc định không tạo thêm lag ở tầng này; peak decay phía trước vẫn tạo release.

## 21.8 Activity detection / repeated capture

Analyzer tính sum của captured floats và so với previous sum ở `+0x50468`.

Nếu sum y hệt previous, activity flag có thể bị hạ. Đây là một phần của stale/inactivity handling, không phải frequency analysis.

Field compositor còn có inactivity counter riêng:

```text
+0x50444 = current inactive count
+0x50440 = timeout/limit, default 120
```

Constant threshold nhỏ khoảng `0.0001` được dùng trong activity logic.

## 21.9 Palette system của Visualizer

Visualizer không chỉ chọn một RGB rồi tô bar; nó tạo **palette field 256×64**.

### External `Colorty` → internal palette type

Bảng mapping xác nhận từ selector `0x1B4E0`:

```text
external 0..10  → internal 1..11
external 11     → internal 20
external 12     → internal 17
external >12    → fallback internal 17
```

Một số internal fixed colors:

| internal | packed constant |
|---:|---:|
| 6 | `0xFFFFFF` |
| 7 | `0x0000FF` |
| 8 | `0x0040FF` |
| 9 | `0x00FFFF` |
| 10 | `0x00FF00` |
| 11 | `0xFF0000` |
| 12 | `0xFFFF00` |
| 13 | `0xFF0040` |

Multi-stop palettes thấy trực tiếp:

```text
internal 1  = [00FF00, 00FFFF, 0000FF]
internal 14 = [00FF00, FFFFFF, 0000FF]
internal 15 = [FF0000, FFFF00, FFFFFF]
internal 16 = [0000FF, FFFFFF, FF0000]
internal 2  = [0000FF,00FFFF,00FF00,FFFF00,FF0000,FF00FF]
internal 3  = reverse-ish [FF00FF,FF0000,FFFF00,00FF00,00FFFF,0000FF]
```

Các type `4,5,17,18,19,20` dùng procedural helper.

## 21.10 Procedural palette đáng chú ý

### Internal 20 = external `Colorty=11`

Uniform RGB toàn field nhưng màu thay đổi theo phase. Ba channel là sine waves lệch nhau khoảng `2π/3`.

Intensity được đổi:

```text
intensity255 = intensityPercent * 2.55
```

Phase advance dùng field `+0x5049C`; speed field `+0x50430`, default 500:

```cpp
phase += speed / 100.0; // default +5 degree/update
wrap 0..360
```

### Internal 17 = external `Colorty=12`

Cùng ý tưởng 3-sine RGB nhưng phase thay đổi theo **x=0..255**, rồi row được repeat qua 64 y. Kết quả là rainbow/wave chạy ngang spectrum.

## 21.11 256×64 field compositor

Field update quanh `0x1BB20`:

1. gọi analyzer.
2. normalize/wrap palette phase.
3. generate background palette field với type `+0x50438`, intensity `+0x50434` (default 70).
4. generate foreground/main palette field với type `+0x50458`, intensity 100.
5. với mỗi `x=0..255`, `y=0..63`, quyết định active/inactive dựa spectrum height.
6. composite foreground/background/fade tùy flags/inactivity.
7. double-buffer output field.
8. tăng phase.

Core vertical occupancy có threshold:

```cpp
active = display[x] > (64 - y) * (1.0f / 64.0f);
```

Nói cách khác `display[x]` trong `[0,1]` được biến thành cột cao 0–64 pixel.

Có edge/mirrored handling đặc biệt quanh một số x region với constants `1/128` và `+0.05`; clone đầu tiên có thể dùng threshold trên, rồi port edge path nếu cần pixel-identical field.

## 21.12 Double buffering

Visualizer giữ các field lớn riêng cho foreground/background/output và swap current read/write pointers (quanh `+0x50428/+0x5042C`). Điều này tránh renderer đọc field đang bị compositor viết dở.

Nếu viết EXE multithread riêng, nên copy đúng ý tưởng này hoặc dùng immutable snapshot + atomic pointer.

## 21.13 Keyboard không dùng 22 FFT bands trực tiếp

Đây là correction lớn so với bản cũ.

Stock trước tiên tạo spectrum/field **256×64**, sau đó `QAudio_Dynamic_Spectrum` chỉ sample field xuống keyboard logical grid **22×6**.

### X coordinates exact

Cột sample:

```text
0, 11, 22, 33, 44, 55, 66, 77, 88, 99, 110,
121, 132, 143, 154, 165, 176, 187, 198, 209, 220, 231
```

Tức step integer = **11**.

### Y coordinates exact

6 row sample:

```text
7, 17, 27, 37, 47, 57
```

Do đó clone gần stock phải là:

```text
256 FFT/display X
→ 256×64 color field
→ sample 22 x-coordinates × 6 y-coordinates
→ logical key matrix
```

không phải `FFT → 22 log bands → height 0..6`.

## 21.14 Logical matrix / physical key mapping

Renderer giữ logical matrix khoảng 6×22; cell `0xFF` = skip/no key. Song song có key mapping WORD/row data và profile `RowButton_i` để validate physical geometry.

Pseudo:

```cpp
for (int row=0; row<6; ++row) {
    int y = kSampleY[row];
    for (int col=0; col<22; ++col) {
        uint8_t key = logical[row][col];
        if (key == 0xFF || key == 0) continue;
        if (!keyBelongsToProfileRow(row,key)) continue;

        int x = kSampleX[col];
        uint32_t packed = visualizerField[y*256 + x];
        RGB c = unpackStockColor(packed);
        setKey(frame,key,c);
    }
}
```

## 21.15 Stale/heartbeat handling

Keyboard renderer có stale path khoảng **300 ms**. Global clear helper còn rate-limit khoảng **500 ms**. Visualizer field thread cũng có sleep/disable paths riêng (`~200 ms` / `~500 ms` trong các trạng thái nhất định).

Không nên gửi black report liên tục mỗi tick khi capture dừng; stock có guard/rate-limit.

## 21.16 Constructor fields hữu ích

Các default đã thấy trực tiếp:

```text
+0x408   = 2000       // pre-config input sensitivity scale
+0x40C   = 1          // spatial smoothing mode
+0x410   = 8          // smoothing radius/block width
+0x414   = 1          // window selector: Hann
+0x418   = 50         // peak decay percent
+0x41C   = 25         // secondary parameter, semantic chưa chốt
+0x420   = 0
+0x424   = 0 flag
+0x50430 = 500.0      // palette phase speed numerator
+0x50434 = 70         // BACKGROUND palette intensity, không phải db
+0x50438 = 0          // background palette type
+0x50440 = 120        // inactivity limit
+0x50444 = 0          // inactivity counter
+0x50448 = 11         // parameter chưa đặt tên chắc chắn
+0x5044C = 0.04
+0x50450 = 0.5
+0x50454 = 1.0        // temporal smoothing alpha
+0x50458 = 5          // foreground/main internal palette type default
+0x5049C = 0          // palette phase degrees
```

Không gán tên cho các field `+0x41C/+0x50448/+0x5044C/+0x50450` trước khi xref arithmetic đầy đủ.

## 21.17 C++ skeleton stock-faithful

```cpp
struct StockSpectrum {
    static constexpr int N = 256;
    std::array<float,N> peak{};
    std::array<float,N> display{};
    int db = 35;
    int windowType = 1;      // Hann
    int spatialMode = 1;
    int radius = 8;
    float decayPct = 50.0f;
    float temporalAlpha = 1.0f;

    void processPrepared256(const std::array<std::complex<float>,N>& input)
    {
        auto z = input;
        applyStockWindow(z, windowType);
        fft256InPlace(z);

        for (auto &v : peak)
            v *= decayPct / 100.0f;

        std::array<float,N> raw{};
        for (int k=0; k<64; ++k) {
            float mag = std::sqrt(std::norm(z[k]));
            float arg = std::max(1.1f*mag, 1e-20f);
            float v = 0.9f*mag + 0.5f*std::log(arg);
            v = std::min(v, 1.0f);
            float p = std::max({peak[4*k], v, 0.0f});
            for (int j=0;j<4;++j) {
                peak[4*k+j] = p;
                raw[4*k+j] = p;
            }
        }

        auto spatial = stockSpatialSmooth(raw, spatialMode, radius);
        for (int i=0;i<N;++i)
            display[i] += (spatial[i]-display[i]) * temporalAlpha;
    }
};
```

Phần cần nối phía trước:

```cpp
inputScale = db * 30.0f;
prepared = aggregateCapturedAudioStockStyle(capture, inputScale);
```

Phần phía sau:

```cpp
field = compose256x64(display, palettes, phase, inactivityState);
frame = sampleFieldToKeyboard(field, logicalMap, profileRows);
sendPerKeyFrame(frame);
```

## 21.18 Những gì còn chưa 100% byte-identical của 428

Phần core FFT/render giờ đã rất sâu. Còn chủ yếu:

1. exact WASAPI format/channel semantics trước bước “sum 4 floats”.
2. một số optional Visualizer flags/inactivity variants.
3. exact edge/mirror field-compositor branch ngoài threshold chính.
4. complete semantic names cho vài constructor fields chưa xref.
5. byte order packed-color nên xác nhận cuối bằng live HID capture trên HERO68.

Những thiếu sót này **không còn ngăn viết một clone rất sát stock**.

# 22. Side/Tape engine

Binary có class:

```text
QTapeEffct
```

Profile có:

```ini
[Tape]
Count=23
```

Các profile khác thấy `Count=18`, `23`, `36`.

UI strings:

```text
Activate Audion
Activate Audion And Side
```

=> side strip là engine riêng nhưng dùng chung audio service.

---

# 23. Side mode 500

ID `500 (0x1F4)` được dispatch trực tiếp trong `QTapeEffct`.

Audio callback kiểm tra mode này **trước common envelope** và return/no render path. Vì vậy trong context “audio side effect” nó là no-op thật, không phải một meter ẩn chưa tìm ra.

Practical mapping cho EXE riêng:

```text
500 = no audio animation / leave side engine inactive
```

Tên marketing gốc vẫn không có trong binary, nên không nên tự đặt “Static/Off” như thể đó là label stock.

# 24. Side mode 501 — one-end fill meter

**ID:** 501 (`0x1F5`)  
**Positional renderer:** quanh `0x28820`  
**Per-pixel send:** quanh `0x291C0`

## 24.1 Audio/state

Side callback dùng common envelope, scale theo byte thiết bị `device+0x75`, rồi `QTapeEffct` giữ target/current/previous state.

Visible state tiến theo **±1 mỗi update** về phía target. Control-flow có hai staging fields nhưng net positional level của 501 là one-step rate limit, không phải jump trực tiếp.

## 24.2 Geometry

Renderer clear side frame rồi:

```cpp
count = clamp((int)level, 0, ledCount);
for (int i=0; i<count; ++i)
    setSideLed(i, color);
```

=> bar tăng từ **index 0 → index N-1**.

## 24.3 Multicolor cadence

Side palette riêng nằm quanh `this+0x2C`. Khi multicolor bật, palette rotate **front→back** theo counter parity; observed cadence khoảng mỗi **2 rendered LED iterations** chứ không phải mỗi full frame.

## 24.4 Send path

501 tạo per-pixel side buffer rồi đi command family `0x0E/0x01` qua chunk/packet path, không dùng global `0x0E/0x02` như 503.

# 25. Side mode 502 — center-out meter

**ID:** 502 (`0x1F6`)  
**Renderer:** quanh `0x289A0`

## 25.1 Level scaling

Sau state smoothing ±1, stock nhân level với **0.5** trước khi convert integer cho renderer:

```cpp
halfLevel = int(level * 0.5);
```

`0.5` là constant xác nhận.

## 25.2 Center-out geometry

```cpp
mid = (ledCount >> 1) - 1;
for (int i=0; i<halfLevel; ++i) {
    if (mid+i < ledCount) set(mid+i,color);
    if (mid-i >= 0)       set(mid-i,color);
}
```

`i=0` có thể ghi center hai lần nhưng vô hại.

Vì level bị ×0.5, một bước logical level đại diện expansion hai phía; tổng số pixel sáng gần tương ứng amplitude nhưng phân bố đối xứng.

## 25.3 Color/send

Dùng cùng side fixed/multicolor logic như 501 và cùng per-pixel family `0x0E/0x01`.

# 26. Side mode 503 — global RGB rise/fall response

**ID:** 503 (`0x1F7`)  
**Core state/curve:** quanh `0x29EF0`  
**Global side packet:** `0x29010` → command family `0x0E/0x02`

Pass 2 chốt được công thức sâu hơn. Mode này **không chỉ `baseRGB * level`**.

Đặt:

```text
L  = current smoothed level
P  = previous level
S  = side scale / LED-count byte (this+0x18, lấy từ device+0x75)
B0 = base byte this+0x60
B1 = base byte this+0x61
B2 = base byte this+0x62
```

Global packet `0x29010(device,C0,C1,C2)` đặt `C0,C1,C2` lần lượt vào ba byte color payload, nên dưới đây dùng **wire-order C0/C1/C2** để tránh gắn nhãn RGB sai trước live capture cuối.

## 26.1 Rising (`L > P`)

```cpp
C0 = max(0, B0 - trunc((B0 / S) * L));
C1 = max(0, B1 - trunc((B1 / S) * L));
C2 = max(0, B2 - trunc((B2 / S) * L));
```

Integer division `B?/S` xảy ra trước multiply trong assembly, nên clone exact **không** nên đổi thành pure floating `B*(1-L/S)` vì rounding khác.

## 26.2 Falling (`P > L`)

Stock cố ý **xoay channel source** và thêm offset 100 ở channel giữa:

```cpp
C0 = max(0, B1 - trunc((B1 / S) * L));
C1 = max(0, 100 + B2 - trunc((B2 + floor(100 / S)) * L));
C2 = max(0, B0 - trunc((B0 / S) * L));
```

Đây là lý do visual khi nhịp đi xuống có **hue shift**, không chỉ fade brightness.

## 26.3 Equality edge case

Control-flow có path local C0/C1/C2 khởi tạo zero nếu comparisons rơi đúng equality. Tuy nhiên normal state update tạo `current = previous ±1`, nên equality gần như không xảy ra trong operating range thông thường.

## 26.4 Clone stock-style

```cpp
RGBWire side503(double L, double P, int S, uint8_t B0, uint8_t B1, uint8_t B2)
{
    auto nz = [](int x){ return (uint8_t)std::max(x,0); };
    if (L > P) {
        return {
            nz(B0 - int((B0 / S) * L)),
            nz(B1 - int((B1 / S) * L)),
            nz(B2 - int((B2 / S) * L))
        };
    }
    if (P > L) {
        return {
            nz(B1 - int((B1 / S) * L)),
            nz(100 + B2 - int((B2 + (100 / S)) * L)),
            nz(B0 - int((B0 / S) * L))
        };
    }
    return {0,0,0};
}
```

Sau đó gửi direct global side report `0x0E/0x02`.

# 27. WebSocket control API

Embedded command strings:

```text
ping
pong
init
start
stop
close
exit

typs
typs_o

typConfig
typConfig_o

change
change_o

mode
color
mcolor
colortype
smooth
gain
db

versions
updata
```

Known response forms:

```text
0|Typs:169,170,171,172,173,180,428|Current:...
0|Typs:500,501,502,503|Current:...
0|typ:428|colortype:%d|db:%d
0|typ:%d|color:mcolor|smooth:%d|gain:%d
```

Có fixed color response dạng `color:#RRGGBB` trong logic config.

**⚠️** Exact grammar/field order cho mọi request chưa trace hoàn toàn. Nếu viết EXE standalone không cần stock UI, có thể bỏ WebSocket layer và expose localhost API riêng.

Nếu muốn drop-in compatibility với UI stock, cần RE tiếp parser command/value grammar.

---

# 28. `Gain`, `Smooth`, `DB` — command → internal value

Pass 2 đã trace được đường command/config tới field, nên phần này không còn hoàn toàn mơ hồ.

## 28.1 `Gain`

Handler `on_ChangeGain` parse slider decimal integer rồi:

```text
main effect value = slider / 10.0
side/tape value   = slider * 0.1
```

Hai biểu thức tương đương. Main setter quanh `0x11CC0` store double ở effect field khoảng `+0x30`. Tape setter quanh `0x29A30` store ở field khoảng `+0x58`.

Ví dụ:

```text
SliderGain = 0  → 0.0
SliderGain = 5  → 0.5
SliderGain = 10 → 1.0
```

## 28.2 `Smooth`

Handler `on_ChangeSmooth` cũng:

```text
smoothInternal = slider / 10.0
```

Main setter `0x11CD0` store field khoảng `+0x38`; tape setter `0x29DE0` store field khoảng `+0x50`.

**Quan trọng:** command→field scaling đã exact, nhưng arithmetic use của hai field này **không đồng nhất/không được trace hết trong mọi mode**. Các mode vẫn có state smoothing hard-coded riêng như ±1, fast attack, palette motion... Không nên giả định `Smooth=0.5` nghĩa là một universal EMA `alpha=0.5` cho tất cả.

## 28.3 `DB` — riêng Dynamic Spectrum

`db` khác hoàn toàn Gain/Smooth.

Handler `on_ChangeDB` ghi:

```cpp
Visualizer.inputScale = db * 30;
```

Do đó:

```text
db=35 → 1050
db=38 → 1140
```

Nó tham gia **FFT input sensitivity** của mode 428.

## 28.4 Khuyến nghị cho clone

- Nếu cần stock-faithful: expose slider như stock, lưu `value/10.0`, nhưng chỉ apply theo đúng field/use path sau khi port từng effect.
- Với 428: implement `db*30` ngay, vì arithmetic use đã chốt.
- Không đổi tên `db` thành “dBFS threshold” trong code nội bộ; stock variable/UI gọi DB nhưng arithmetic thực là linear sensitivity multiplier.

# 29. Màu multicolor / palette rotation

Các scalar effects chia sẻ helper palette quanh `0x12450` / `0x12920`.

## 29.1 Data structure

Palette chứa QColor-like entries kích thước khoảng **16 byte/entry** trong Qt container.

Helper get lấy color theo index. Helper advance thực hiện exact queue rotation:

```cpp
auto first = palette.front();
palette.pop_front();
palette.push_back(first);
```

## 29.2 Cadence theo mode

Không phải effect nào cũng rotate cùng tốc độ:

| Mode | Palette advance observed |
|---|---|
| 169 Dazzling | khoảng mỗi **3 effect update** |
| 170 Clouds | khoảng mỗi normal render frame/path |
| 172 Gurgling | khoảng mỗi **20 effect update** |
| 173 Blooming | **mỗi audio update** khi multicolor |
| side 501/502 | palette riêng; khoảng mỗi **2 rendered LED iterations** |

Vì vậy clone dùng một global `palettePhase += 1` cho mọi mode sẽ không giống stock.

## 29.3 Dynamic Spectrum khác hệ palette scalar

428 dùng **Visualizer palette field generator** riêng (fixed, multi-stop và procedural sine/rainbow types). Không reuse queue cadence ở bảng trên.

# 30. Kiến trúc EXE mới khuyến nghị

```text
HeroMusicClone.exe
│
├── DeviceManager
│   ├── HID enumeration
│   ├── match HERO68
│   └── reconnect handling
│
├── WasapiLoopback
│   ├── Core Audio capture
│   └── mono/audio-window builder
│
├── AudioAnalysis
│   ├── StockEnvelope
│   └── Spectrum22 analyzer
│
├── Geometry/Profile
│   ├── Dazzling rings
│   ├── Clouds rows
│   ├── Gurgling columns
│   ├── Bloom patterns/shells
│   └── Dynamic physical rows
│
├── EffectEngine
│   ├── 169 DazzlingRock
│   ├── 170 Clouds
│   ├── 171 LightField
│   ├── 172 GurglingStream
│   ├── 173 BloomingPassion
│   ├── 180 Off
│   └── 428 DynamicSpectrum
│
├── FrameEncoder
│   └── RGB frame -> color groups
│
├── HidPacketizer
│   ├── 0x08 keyboard
│   ├── 0x0E tape
│   └── checksum
│
├── UsbRenderThread
│   └── overlapped WriteFile
│
└── Control/UI (optional)
    ├── CLI
    ├── tray app
    └── WebSocket compatible layer
```

---

# 31. Thread model

Khuyến nghị 3 thread chính:

## 31.1 Capture thread

- WASAPI event.
- Convert/copy samples vào lock-free/latest audio buffer.

## 31.2 Effect thread

Mỗi ~30 ms:

1. Snapshot recent audio window.
2. Run analyzer.
3. Render mode.
4. Encode frame.
5. Push newest encoded frame/report batch.

Không queue hàng chục frame — bỏ frame cũ nếu USB chậm.

## 31.3 USB thread

- Chỉ thread này gọi `WriteFile`.
- Send all reports của một frame liền nhau.
- Không interleave packet batch của hai frames.
- Handle unplug/reconnect.

---

# 32. `sendPerKeyFrame` implementation

```cpp
void Controller::sendPerKeyFrame(const Frame& f)
{
    auto stream = encodeFrame(f);

    // Nếu stream empty, tùy semantics bạn muốn:
    // - stock-like clear path: send global black
    // - hoặc skip nếu effect code đã clear separately.
    if (stream.empty()) {
        usb.enqueue(globalRgb(reportByte, false, {0,0,0}));
        return;
    }

    auto reports = packetize(stream, reportByte, false);
    usb.enqueueBatch(std::move(reports));
}
```

**Gợi ý:** cho clone standalone, send global black khi frame empty sẽ tránh trạng thái LED cũ bị giữ nếu firmware không nhận một new-frame marker khi packet count = 0.

---

# 33. HID report byte 0

Stock lấy byte 0 từ field khoảng:

```text
hidObject + 0x3C
```

Không nên hard-code `0` hoặc `1` nếu chưa capture chính target HERO68.

Khi enumerate/open HID, log:

- `OutputReportByteLength`
- report ID behavior
- first byte stock capture

và config nó vào `reportByte`.

---

# 34. Device reconnect

Một EXE thay stock nên xử lý:

```text
WriteFile failed
   ↓
ERROR_DEVICE_NOT_CONNECTED / INVALID_HANDLE
   ↓
close handle
   ↓
backoff
   ↓
enumerate HID again
   ↓
reopen
   ↓
resend current mode/current frame
```

Không giữ pending OVERLAPPED object sau khi handle bị đóng.

---

# 35. Dynamic Spectrum — recipe clone stock thay cho “22-band replacement” cũ

Phần “FFT 1024/2048 → 22 log bands” của bản trước chỉ là fallback practical. Sau pass 2, nếu mục tiêu giống stock, **không dùng pipeline đó**.

## 35.1 Stock-faithful DSP recipe

```text
capture float stream
→ aggregate stock-style groups of 4
→ multiply by db*30 and 0.5 aggregate factor
→ make 256 working pairs
→ window selector (default Hann)
→ 256 FFT
→ bins 0..63 only
→ magnitude
→ v = 0.9*mag + 0.5*ln(1.1*mag)
→ clamp upper 1
→ peak decay old*=0.5 default
→ max(old,new,0)
→ repeat each bin 4x => 256 X values
→ centered moving average radius 8 default
→ temporal EMA alpha 1 default
→ 256×64 field
→ sample 22×6 into keyboard
```

## 35.2 Reference code skeleton

```cpp
constexpr int FFT_N = 256;
constexpr int USED_BINS = 64;
constexpr int FIELD_W = 256;
constexpr int FIELD_H = 64;

static const int kX[22] = {
    0,11,22,33,44,55,66,77,88,99,110,
    121,132,143,154,165,176,187,198,209,220,231
};
static const int kY[6] = {7,17,27,37,47,57};

float stockCurve(float re, float im)
{
    float mag = std::sqrt(re*re + im*im);
    float arg = std::max(1.1f*mag, 1e-20f);
    return std::min(0.9f*mag + 0.5f*std::log(arg), 1.0f);
}
```

## 35.3 Window selector

```cpp
float window(int type, int n)
{
    constexpr int N=256;
    float a = 2.0f * 3.14f * float(n) / float(N);
    switch(type) {
        case 1: return 0.5f * (1.0f - std::cos(a));
        case 2: return 0.54f - 0.46f * std::cos(a);
        case 3: return 0.42f - 0.5f*std::cos(a) + 0.08f*std::cos(2*a);
        default:return 1.0f;
    }
}
```

Nếu muốn numerical match tốt hơn, port literal precision/order từ x86 SSE thay vì compiler fast-math.

## 35.4 Field height

Core occupancy:

```cpp
for (int x=0;x<256;++x) {
    for (int y=0;y<64;++y) {
        bool active = display[x] > (64-y)*(1.0f/64.0f);
        field[y][x] = active ? fgPalette[y][x] : bgPalette[y][x];
    }
}
```

Stock có thêm branches cho fade/inactivity/edges; đây là core cần có trước.

## 35.5 Sampling xuống HERO layout

Không resample spectrum thành 22 bands. Chỉ lấy color tại `field[kY[row]][kX[col]]`, rồi dùng logical matrix/profile row validation để tìm key ID.

## 35.6 Điều còn cần live-test

- capture four-float grouping/channel semantics.
- exact packed color byte order trên thiết bị.
- optional Visualizer flags.

Nhưng FFT size, windows, bins, curve, smoothing, field resolution và keyboard sample coordinates đã đủ để viết bản rất sát stock.

# 36. Profile abstraction cho HERO68

Không nên để effect code hard-code key IDs rải rác.

```cpp
struct HeroProfile {
    std::vector<std::vector<uint16_t>> dazzlingRings;
    std::vector<std::vector<uint16_t>> cloudsRows;
    std::vector<std::vector<uint16_t>> gurglingColumns;
    std::vector<std::vector<std::vector<uint16_t>>> bloomPatterns;
    std::vector<std::vector<uint16_t>> spectrumRows;
    int tapeCount = 0;
};
```

Nếu sau này hỗ trợ HERO68 variant khác, chỉ đổi profile/geometry.

---

# 37. Config format đề xuất cho EXE mới

Có thể giữ gần stock để dễ import:

```ini
[Device]
Vid=0x0000
Pid=0x0000
ReportByte=0

[Audio]
RenderMs=30

[DazzlingRock]
Color=246,17,165
Multicolor=1

[DynamicSpectrum]
ColorType=7
Sensitivity=35

[Tape]
Count=23
```

VID/PID ở ví dụ để `0x0000` có chủ ý — phải detect/cấu hình từ device thật, không invent.

---

# 38. State machine đề xuất

```text
DISCONNECTED
    │ device found
    ▼
CONNECTED_IDLE
    │ start
    ▼
CAPTURING
    │ mode 169/170/...
    ▼
RUNNING_EFFECT
    │ mode switch
    ├──────────────┐
    │              │
    ▼              │
CLEAR_FRAME        │
    │              │
    └──> new effect┘

stop/off → CONNECTED_IDLE
unplug   → DISCONNECTED
```

Khi switch mode, clear old frame trước để geometry cũ không linger.

---

# 39. Những gì cần log khi phát triển clone

Tạo debug log:

```text
[HID] path, vid, pid, outputReportLength, reportByte
[AUDIO] sampleRate, channels, format
[AUDIO] raw envelope, normalized level
[EFFECT] mode, target, prev, active groups
[ENC] nonblack keys, color groups, encoded length
[USB] packets, seq, len, checksum, WriteFile result
```

Hex dump chỉ cần 1–2 packet đầu khi debug; đừng spam console mỗi 30 ms ở production.

---

# 40. Test protocol không cần audio

Trước khi viết analyzer, test từ thấp lên:

## Test A — global RGB keyboard

Send:

```text
?? 08 02 00 01 00 03 FF 00 00 ... CS
```

Nếu toàn keyboard đổi màu → HID/reportByte/checksum đúng.

## Test B — một color group

Encoded stream:

```text
FF 00 00 01 24
```

(ví dụ keyId `0x24` = 36)

Packet:

```text
?? 08 01 00 01 00 05 FF 00 00 01 24 ... CS
```

Nếu đúng key sáng đỏ → per-key parser đúng.

## Test C — nhiều group + crossing chunk

Tạo stream >56 byte để chắc packet count/index/reassembly đúng.

Sau khi protocol ổn mới nối WASAPI.

---

# 41. Mapping confidence theo mode

| Mode | Core algorithm | Geometry/state | DSP/input | Transport | Confidence hiện tại |
|---|---|---|---|---|---|
| 168 | implementation absent | n/a | n/a | n/a | ✅ kết luận dead/legacy trong build này |
| 169 | radial rings + white wavefront | ✅ | ✅ common envelope | ✅ | **rất cao** |
| 170 | row span + moving gradient/shadow | ✅ gần đủ | ✅ common envelope | ✅ | **cao** |
| 171 | global rise/fall RGB | ✅ | ✅ common envelope×0.01 | ✅ global | **rất cao** |
| 172 | scrolling history columns + crest | ✅ exact queue direction | ✅ common envelope | ✅ | **rất cao** |
| 173 | round-robin bloom shells | ✅ | ✅ common envelope | ✅ | **rất cao** |
| 180 | off/clear | ✅ | n/a | ✅ | **cao** |
| 428 | FFT→256×64 field→22×6 sample | ✅ renderer/field | ✅ FFT core rất sâu | ✅ | **cao–rất cao** |
| 500 | no-op in audio callback | ✅ | n/a | n/a | **rất cao** |
| 501 | one-end side fill | ✅ | ✅ scalar | ✅ side pixel | **rất cao** |
| 502 | center-out, level×0.5 | ✅ | ✅ scalar | ✅ side pixel | **rất cao** |
| 503 | direction-dependent global RGB | ✅ formulas | ✅ scalar | ✅ global side | **cao**; cuối cùng chỉ cần verify channel naming |

# 42. Các constant đã xác nhận hữu ích

## Scalar/effect constants

```text
0.01       Light Field audio scale
0.3        Dazzling single-ring dim factor
0.5        Side 502 level scale; cũng xuất hiện Visualizer math
0.6        Light Field decay factor
1.0        nhiều state step / Visualizer temporal alpha default
1.3        Gurgling crest multiplier
10         Light Field attack accumulator increment
80         Clouds shadow-edge channel subtraction
90.0       Blooming fractional-shell offset
100        Side 503 falling color offset
```

## Dynamic Spectrum constants/defaults

```text
FFT_N = 256
USED_BINS = 64
FIELD = 256×64
keyboard sample = 22×6
window default = Hann
spatial mode default = 1
spatial radius default = 8
peak decay default = 50%
temporal alpha default = 1.0
palette background intensity default = 70
inactivity limit default = 120
palette phase speed field default = 500 → +5°/update
```

Curve constants:

```text
0.9
0.5
1.1
```

Window/palette constants observed:

```text
0.08
0.42
0.46
0.54
2.0
2.55     = 255/100
3.14     π approximation used in code paths
1.4117647 ≈ 360/255
2.09333  ≈ 2π/3 using π≈3.14
1/64     = 0.015625
1/128    = 0.0078125
0.0001   activity epsilon
```

Config `db` mapping:

```text
inputScale = db * 30
```

# 43. Những điểm KHÔNG nên đoán khi viết EXE

1. **Đừng invent mode 168 như thể đó là stock.** Binary này không chứa implementation.
2. **Đừng coi `db` của 428 là dBFS threshold.** Stock dùng nó như linear scale `db*30`.
3. **Đừng làm 428 thành 22 log FFT bands nếu mục tiêu là stock-faithful.** Stock là FFT256 → 64 bins×4 → field256×64 → sample22×6.
4. **Đừng dùng một smoothing chung cho tất cả modes.** 169/170/172/173/428 có state rules khác nhau.
5. **Đừng rotate multicolor cùng cadence ở mọi effect.** Cadence khác nhau rõ ràng.
6. **Đừng gửi internal frame 0x208 byte thẳng xuống HID.** Stock group same-color keys rồi mới chunk packet.
7. **Đừng assume side 503 là brightness-only.** Falling path xoay channel source + offset 100.
8. **Đừng hard-code profile scale/orientation từ một layout** nếu EXE muốn hỗ trợ model khác.
9. **Đừng gọi packed palette constants là RGB theo trực giác** trước khi verify unpack/wire channel order trên hardware.
10. **Đừng bỏ double buffering/stale guards ở 428** nếu capture/render chạy trên thread khác nhau; dễ tearing hoặc flood black frames.

# 44. Roadmap để đạt clone gần như 1:1

## Phase 1 — transport

- mở đúng HID interface/report length.
- global keyboard RGB `0x08/0x02`.
- per-key grouped payload `0x08/0x01`.
- side per-pixel `0x0E/0x01`.
- side global `0x0E/0x02`.
- 56-byte chunks + sequence + checksum.

## Phase 2 — scalar modes

Port theo thứ tự dễ verify:

1. 171 Light Field.
2. 169 Dazzling.
3. 172 Gurgling.
4. 173 Blooming.
5. 170 Clouds.
6. 501/502/503 side.

Ở giai đoạn này dùng stock envelope `peak-positive - arithmetic mean` và geometry embedded.

## Phase 3 — Dynamic Spectrum 428

Không còn cần “đoán analyzer”. Implement:

1. WASAPI loopback.
2. stock-style capture aggregate.
3. `inputScale=db*30`.
4. FFT256 + selected window.
5. first64 bins, nonlinear curve.
6. peak decay + spatial smoothing + temporal alpha.
7. 256×64 field + Visualizer palette.
8. 22×6 sampling coordinates.
9. logical→physical key mapping.
10. stale/inactivity behavior.

Sau đó live-capture stock để tune 3 phần còn lại: sample grouping, optional field edge branches, packed color order.

## Phase 4 — stock/drop-in UX

- WebSocket grammar nếu muốn stock UI điều khiển EXE mới.
- `typConfig`, `change`, `change_o` responses.
- config persistence.
- device reconnect.
- optional update/version behavior (không cần nếu standalone).

# 45. Minimal core code layout

```cpp
class Effect {
public:
    virtual ~Effect() = default;
    virtual void reset() = 0;
    virtual void tick(const AudioWindow& audio, Frame& out) = 0;
};

class HidTransport {
public:
    bool open();
    void close();
    bool write(const Report64& report);
    bool writeBatch(std::span<const Report64> reports);
};

class HeroController {
public:
    void setMode(int id);
    void setColor(RGB c);
    void setMulticolor(bool v);
    void renderTick();

private:
    HidTransport hid;
    std::unique_ptr<Effect> effect;
    Frame frame{};
};
```

Mode 171 và 503 có thể implement một interface `DirectReportEffect` riêng vì không cần `Frame`.

---

# 46. Suggested CLI cho bản đầu

```text
HeroMusicClone.exe --list-hid
HeroMusicClone.exe --vid 0x.... --pid 0x.... --mode 169
HeroMusicClone.exe --mode 172 --color 246,17,165
HeroMusicClone.exe --mode 428 --sensitivity 35
HeroMusicClone.exe --mode 180
```

Bản đầu không cần GUI; log packet và visual correctness trước.

---

# 47. Embedded profile mẫu đầy đủ

Dưới đây là **profile đầu tiên được extract trực tiếp từ binary**, hữu ích để dựng geometry/reference parser. Các dòng này là data stock, không phải geometry tự nghĩ ra.

```ini
[remark]
Typ1=168:AUDIO_DANCE_SOFT:
Typ2=169:DAZZLING_ROCK:
Typ3=170:CLOUDS_RISE_AND_SNOW_FLY:
Typ4=171:LIGHT_FIELD_CHANGE:
Typ5=172:THE_GURGLING_STREAM:
Typ6=173:BLOOMING_PASSION:
Typ7=180:EFFCT_OFF:
Typ8=428:DYNAMIC_SPECTRUM:
[DeviceConfig]
AudionCount=2
AudionTyp=169|428
Version=1
Typ =1
[Dazzling_rock]
other=
Index_numble=11
RowButton_1 ="36"
RowButton_2 ="35,49,50,37,22,23"
RowButton_3 ="21,34,48,24,38,51,61,62,63"
RowButton_4 ="7,20,33,47,60,8,9,10,11,25,39,52,64"
RowButton_5 ="6,19,32,46,59,12,26,40,53,65,72"
RowButton_6 ="5,18,31,45,58,13,27,41,54,66,73"
RowButton_7 ="4,17,30,44,57,70,99,98,102,103,74,76"
RowButton_8 ="3,16,29,43,56,69,95,78,92,89,85,75"
RowButton_9 ="2,15,28,42,55,68,96,79,93,90,87,77"
RowButton_10 ="1,14,67,100,80,94,91,88,85"
RowButton_11 ="101,81,82,83,84"
GrabAudioTime=30
LabelColorMap="246,17,165"
MColour=true
SliderGain=0
SliderSmooth=0
[Dynamic_Spectrum]
other=
Index_numble=6
RowButton_1="1,2,3,0,4,5,6,7,8,9,10,11,12,13,99,95,96,100,101"
RowButton_2="14,15,16,17,18,19,20,21,22,23,24,25,26,27,98,78,79,80,81"
RowButton_3="28,29,30,31,32,33,34,35,36,37,38,39,40,41,102,92,93,94,82"
RowButton_4="42,43,44,45,46,47,48,49,50,51,52,53,54,103,89,90,91"
RowButton_5="55,56,57,58,59,60,61,62,63,64,65,66,74,85,87,88"
RowButton_6="67,68,69,70,72,73,76,75,77,85,84,83"
GrabAudioTime=30
LabelColorMap="82,0,0"
MColour=true
SliderGain=0
SliderSmooth=0
Colorty=7
db=35
[The_gurgling_stream]
other=
Index_numble=19
RowButton_1="67,55,42,28,14,1"
RowButton_2="68,56,43,29,15,2"
RowButton_3="69,57,44,30,16,3"
RowButton_4="58,45,31,17,4"
RowButton_5="59,46,32,18,5"
RowButton_6="60,47,33,19,6"
RowButton_7="70,61,48,34,20,7"
RowButton_8="62,49,35,21,8"
RowButton_9="63,50,36,22,9"
RowButton_10="72,64,51,37,23,10"
RowButton_11="73,65,52,38,24,11"
RowButton_12="76,66,53,39,25,12"
RowButton_13="75,74,54,40,26,13"
RowButton_14="77,41,27"
RowButton_15="103,102,98,99"
RowButton_16="85,89,92,78,95"
RowButton_17="85,87,90,93,79,96"
RowButton_18="84,88,91,94,80,100"
RowButton_19="83,82,81,101"
GrabAudioTime=30
LabelColorMap="246,17,165"
MColour=true
SliderGain=0
SliderSmooth=0
[Clouds_Rise_And_Snow_Fly]
other=
Index_numble=6
RowButton_1="1,2,3,0,4,5,6,7,8,9,10,11,12,13,99,95,96,100,101"
RowButton_2="14,15,16,17,18,19,20,21,22,23,24,25,26,27,98,78,79,80,81"
RowButton_3="28,29,30,31,32,33,34,35,36,37,38,39,40,41,102,92,93,94,82"
RowButton_4="42,43,44,45,46,47,48,49,50,51,52,53,54,103,89,90,91"
RowButton_5="55,56,57,58,59,60,61,62,63,64,65,66,74,85,87,88"
RowButton_6="67,68,69,70,72,73,76,75,77,85,84,83"
GrabAudioTime=30
LabelColorMap="246,17,165"
MColour=true
SliderGain=0
SliderSmooth=0
[Blooming_passion]
other=
Index_numble=8
RowButton_1="31|17,18,32,45,30,44|16,29,43,56,57,46,33,19,4,5,58,3|2,15,28,42,55,68,69,47,59,34,20,6|1,14,67,7,21,35,48,60|8,22,36,49,61|9,23,37,50,62|10,24,38,51,63|11,25,39,52,64,70|12,26,40,53,65,72|13,27,41,54,66,73|76,74,103,102,98|99,78,92,89,75|95,79,93,90,85,77|96,80,94,91,87,85|100,81,82,88,84|101,83"
RowButton_2="39|25,26,40,53,38,52|24,37,51,64,65,66,54,41,27,13,12,11|10,23,36,50,63,98,102,74,76,73,72,103|9,22,35,49,62,99,78,92,89,85,77,75|8,21,34,48,61,95,79,93,90,87|7,20,33,47,60,96,80,94,91,88,85|6,19,32,46,59,100,81,82,84|5,18,31,45,58,101,83|4,17,30,44,57,70|3,16,29,43,56,69|2,15,28,42,55,68|1,14,67"
RowButton_3="32,102|18,31,45,19,33,46,98,41,78,92,103|17,30,44,57,58,47,34,20,6,5,4,99,27,40,54,74,89,93,79,95,85|3,16,29,43,56,69,59,48,35,21,7,13,26,39,53,66,76,75,77,85,87,90,80,96,94|2,15,28,42,55,68,8,22,36,49,60,12,25,38,52,65,73,100,81,82,91,88,84|1,14,67,9,23,37,50,61,11,24,51,64,72,101,83|10,63,62,70"
RowButton_4="101|100,80,81|96,79,93,94|95,78,92,90,91,82,89|99,98,102,103,85,87,88|27,41,54,74,75,77,85,84,83|13,26,40,53,66,76|12,25,39,52,65,73|11,24,38,51,64,72|10,23,37,50,63|9,22,36,49,62|8,21,35,48,61|7,20,34,47,60|6,19,33,46,59|5,18,32,45,58,70|4,17,31,44,57,69|3,16,30,43,56|2,15,29,68|1,14,28,42,55,67"
RowButton_5="1,103|2,15,14,102,41,74,89,92,54,85|3,16,29,28,40,53,66,76,75,77,85,87,90,93,78,98,27|4,17,30,43,42,13,26,39,52,65,73,99,95,79,94,91,88,84|5,18,31,44,56,55,12,25,38,51,64,72,96,80,82,83|67,68,69,57,45,32,19,6,11,24,37,50,63,100,81|7,20,33,46,58,10,23,36,49,62,101|9,22,35,48,61,8,21,34,47,59|60,70"
RowButton_6="36|22,35,49,50,37,23|21,9,10,24,38,51,63,62,48,34,8,61|7,20,33,47,60,11,25,39,52,64|6,19,32,46,59,12,26,40,53,65,72|5,18,31,45,58,13,27,41,54,66,73|4,17,30,44,57,70,98,102,103,74,76|3,16,29,43,56,69,99,92,89,75,78|2,15,28,42,55,68,95,79,93,90,85,77|1,14,67,96,80,94,91,87,85|100,81,82,88|101,83,84"
RowButton_7="8|7,21,22,9|6,20,34,35,36,23,10|5,19,33,47,48,49,50,37,24,11|4,18,32,46,59,60,61,62,63,51,38,25,12|3,17,31,45,58,64,52,39,26,13|2,16,30,44,57,70,65,53,40,27|15,29,43,56,69,99,98,41,54,66,73,72|1,14,28,42,55,68,95,78,102,103,74,76|67,75,89,92,79,96|77,85,90,93,80,100|85,87,91,94,81,101|82,88,84,83"
RowButton_8="82|81,94,91,88,83|101,80,93,90,87,84|100,79,92,89,85,85|96,78,102,103|95,98,41,54,74,77|99,27,40,53,66,76,75|13,26,39,52,65,73|12,25,38,51,64,72|11,24,37,50,63|10,23,36,49,62|9,22,35,48,61|8,21,34,47,60|7,20,33,46,59|6,19,32,45,58,70|5,18,31,44,57|4,17,30,43,56,69|3,16,29,42,55,68|2,15,28,67|1,14"
GrabAudioTime=30
LabelColorMap="140,0,0"
MColour=true
SliderGain=0
SliderSmooth=0
[AudioParam]
other=
GrabAudioTime=35
DefaultAudio=Dynamic_Spectrum
OPen=true
EditTime=false
[Tape]
Count=23
```

---

# 48. Tóm tắt cơ chế từng mode để implement nhanh

## 168 Audio Dance Soft

```text
metadata only trong build này
→ không có class/getter/dispatch live
→ không thể RE algorithm stock từ binary 1.0.2.8
```

## 169 Dazzling Rock

```text
common envelope
→ modulo/scale quirk
→ visible level ±1
→ floor(level)=ring count
→ fill rings từ tâm ra ngoài
→ leading/outer ring trắng
→ special one-ring: white hoặc color×0.3
→ multicolor rotate ~mỗi 3 update
→ grouped per-key HID
```

## 170 Clouds

```text
common envelope
→ modulo/scale
→ attack = target ngay, release -1
→ per-row active span
→ moving phase
→ linear channel gradient: base - base/(2A)*i
→ moving shadow edge: max(base-80,0)
→ layout orientation branch
→ grouped per-key HID
```

## 171 Light Field

```text
common envelope ×0.01
→ compare current/previous
→ rising: phase +=10
→ else: phase=int(phase×0.6)
→ derive global color with uint8 semantics
→ 0x08/0x02 direct RGB
```

## 172 Gurgling Stream

```text
common envelope
→ modulo scale (~5 default)
→ level approaches target ±1
→ history.pop_back(); history.push_front(level)
→ newest amplitude at first column, old amplitudes trail across keyboard
→ column height from history[x]
→ crest/top key ×1.3
→ palette rotate ~20 updates
→ grouped per-key HID
```

## 173 Blooming Passion

```text
common envelope
→ modulo divisor (~99 init/default observed)
→ level approaches target ±1
→ pattern changes deterministic round-robin ~11 updates
→ multicolor rotates every update
→ full shells use base/palette
→ fractional shell = base*frac +90
→ Sleep(10)
→ grouped per-key HID
```

## 180 Off

```text
stop/clear effect path
→ clear/black state with stock guards
```

## 428 Dynamic Spectrum

```text
WASAPI loopback
→ input sensitivity = db×30
→ aggregate capture groups
→ FFT256 (default Hann; Hamming/Blackman supported)
→ bins 0..63
→ mag=sqrt(re²+im²)
→ v=0.9*mag +0.5*ln(1.1*mag), cap upper 1
→ old peak ×0.5 default, max with new
→ repeat each bin ×4 => 256 spectrum X
→ centered moving avg radius8 default
→ temporal alpha1 default
→ compose foreground/background palettes into 256×64 field
→ active threshold display[x] > (64-y)/64
→ sample X=0,11,...231 and Y=7,17,27,37,47,57
→ logical 6×22 → physical key map
→ grouped per-key HID
```

## Tape 500

```text
audio callback no-op / no rhythm render
```

## Tape 501

```text
common scalar audio
→ side state ±1
→ fill LED 0..N-1
→ optional palette queue
→ 0x0E/0x01 per-pixel path
```

## Tape 502

```text
common scalar audio
→ side state ±1
→ ×0.5
→ midpoint=(count>>1)-1
→ fill mid±i
→ 0x0E/0x01
```

## Tape 503

```text
common scalar audio
→ state changes ±1
→ rising: B0/B1/B2 each decrease by integer level ratio
→ falling: channel-source rotation + middle offset100 formula
→ global C0/C1/C2
→ 0x0E/0x02
```

# 49. Kết luận kỹ thuật sau RE pass 2

`HEROMusicServe.exe` là một **PC-side realtime RGB renderer**, không phải lệnh “bật music mode” rồi để firmware tự phân tích nhạc.

```text
Windows loopback audio
→ PC DSP/effect state
→ PC RGB renderer
→ color-group compression
→ HID packetizer
→ keyboard/side LEDs
```

Sau pass 2:

- `169/170/171/172/173` đã có core algorithm đủ sâu để clone sát stock.
- `500–503` đã có state/geometry; 503 có cả rise/fall formula wire-order.
- `428` không còn là black box: đã xác định **FFT256, 3 window types, 64 bins, nonlinear magnitude curve, peak decay, spatial/temporal smoothing, 256×64 compositor, palette engine và exact 22×6 sample coordinates**.
- `168` được xác định là **legacy metadata không có implementation trong binary hiện tại**.
- `Gain/Smooth` command scaling đã trace (`/10`), `db` đã trace exact (`×30`).

Vì vậy một EXE riêng hiện có thể được thiết kế theo stock architecture thay vì “visual approximation”. Phần còn phải dùng live hardware/capture để khóa 1:1 chủ yếu là **WASAPI sample grouping của 428, packed channel naming/order cuối, vài optional Visualizer flags và model-specific orientation/profile init**.

# 50. RE address index — pass 2

| Function/region | Workspace offset | Ý nghĩa |
|---|---:|---|
| Common amplitude/envelope analyzer | `0x29740` | scalar effects + side |
| Blooming ID getter | `0x12C70` | returns 173 |
| Blooming update | `0x12C80` | scalar state/pattern cadence |
| Blooming renderer | `0x12E00` | shells/fractional edge |
| Blooming next-pattern helper | `0x14050` | deterministic round-robin |
| Clouds ID getter | `0x147B0` | returns 170 |
| Clouds update | `0x147C0` | attack/release |
| Clouds renderer | `0x14890` | rows/gradient/shadow |
| Dazzling ID getter | `0x15970` | returns 169 |
| Dazzling update | `0x15980` | level/palette state |
| Dazzling renderer | `0x15A90` | rings/wavefront |
| Light Field ID getter | `0x16930` | returns 171 |
| Light Field core | `0x16940` | global RGB rise/fall |
| Gurgling ID getter | `0x16BB0` | returns 172 |
| Gurgling core | `~0x16BD0` | history stream |
| Shared color-group frame transform | `0x178A0` | RGB frame → grouped records |
| Dynamic ID getter | `0x181A0` | returns 428 |
| Dynamic keyboard renderer | `~0x181B0` | field → 22×6 keys |
| Global keyboard RGB packet | `0x184B0` | `0x08/0x02` |
| Visualizer Blackman helper | `~0x19090` | 256 window |
| Visualizer bit reversal | `~0x19030` | FFT |
| Visualizer butterfly FFT | `~0x19160` | FFT |
| Visualizer Hamming helper | `~0x19400` | window |
| Visualizer Hann helper | `~0x194A0` | default window |
| Visualizer FFT wrapper | `~0x19540` | window/FFT path |
| Visualizer palette generator | `~0x1A2F0` | fixed/multistop/procedural |
| Visualizer external color selector | `~0x1B4E0` | `Colorty` map |
| Visualizer singleton accessor | `0x1AAB0` | current Visualizer |
| Visualizer constructor/init | `0x1ADB0` | defaults/state |
| Visualizer main analyzer | `~0x1B550` | capture→FFT→spectrum |
| Visualizer field compositor | `~0x1BB20` | 256×64 color field |
| WebSocket/config ChangeDB | `~0xF570` | `db*30` |
| WebSocket/config ChangeGain | `~0xF6C0` | slider/10 |
| WebSocket/config ChangeSmooth | `~0xF840` | slider/10 |
| Main effect gain setter | `0x11CC0` | store field |
| Main effect smooth setter | `0x11CD0` | store field |
| Side one-end renderer | `0x28820` | mode501 |
| Side center renderer | `0x289A0` | mode502 |
| Global side RGB packet | `0x29010` | `0x0E/0x02` |
| Side per-pixel send | `0x291C0` | mode501/502 |
| Side state/dispatch | `0x29EF0` | 500–503 |
| Side audio callback | `0x2A110` | common envelope + scale |
| HID checksum | `0x6E40` | sum64 = 0xFF mod256 |
| HID chunk packetizer | `0x28CF0` | 56-byte payload chunks |

Các offset là **workspace offset trong unpacked RE stream**, không phải RVA để patch packed EXE trực tiếp.

# 51. Những phần còn lại nếu muốn “1:1 tuyệt đối”

Sau pass này không còn mode live nào lớn bị bỏ trống. Các việc tiếp theo chủ yếu là refinement/validation:

1. **Dynamic 428 input format:** trace WASAPI `WAVEFORMAT*`/capture conversion để biết 4 float aggregate chính xác là frame/channel nào.
2. **Dynamic field edge branches:** port hết mirror/edge/inactivity flags để field pixel-identical.
3. **Color channel final validation:** capture HID trên HERO68 để khóa tên R/G/B cho mọi packed palette/global side path; wire byte positions đã biết.
4. **Gain/Smooth arithmetic consumers:** xref field `+0x30/+0x38` của base effect và `+0x58/+0x50` tape để biết slider tác động chính xác tới từng path, ngoài hard-coded state rules.
5. **Clouds special orientation:** trace model flag `device+0x40 ==2/3` thành exact key index mapping.
6. **Visualizer optional constructor fields:** đặt semantic names cho `+0x41C`, `+0x50448`, `+0x5044C`, `+0x50450` bằng xref complete.
7. **Mode 168:** cần **binary/version khác**; build hiện tại không còn code để RE tiếp.
8. Nếu mục tiêu là drop-in thay service stock, RE nốt exact WebSocket request grammar/ack/error codes; nếu standalone thì không cần.

Với mục tiêu “viết EXE riêng để chạy LED rhythm”, phần kỹ thuật cốt lõi hiện đã đủ để bắt đầu implementation thay vì tiếp tục chờ RE.

