Vendored from https://github.com/nefarius/ViGEmClient at
`b66d02d57e32cc8595369c53418b843e958649b4` (MIT; LICENSE included).
Only headers and the static client implementation are built. The kernel driver
is installed separately using the official ViGEmBus 1.22.0 release.

Local patch: when the bus plugs a target in but WAIT_DEVICE_READY fails, mark
the allocated child connected before removing it, so removal actually reaches
the bus. Return VIGEM_ERROR_WINAPI and preserve the original Windows error
across cleanup rather than reporting TARGET_NOT_PLUGGED_IN from the client
state check. ERROR_INVALID_PARAMETER retains the upstream pre-1.17 behavior.
Covered by tests/native-vigem-startup.test.cpp without accessing a real driver.
