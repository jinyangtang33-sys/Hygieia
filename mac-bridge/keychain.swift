import Foundation
import Security

// Secrets travel only over the parent process's anonymous pipes. The macOS
// Keychain stores them encrypted; no credential is written to a config file.
let action = CommandLine.arguments.dropFirst().first ?? ""
let base: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                         kSecAttrService as String: "Guanji.OpenSource.PulsBridge.v1",
                         kSecAttrAccount as String: "connection"]
if action == "read" {
    var q = base
    q[kSecReturnData as String] = true
    q[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: CFTypeRef?
    let status = SecItemCopyMatching(q as CFDictionary, &result)
    if status == errSecItemNotFound { exit(3) }
    guard status == errSecSuccess, let data = result as? Data else { exit(1) }
    FileHandle.standardOutput.write(data)
} else if action == "write" {
    let data = FileHandle.standardInput.readDataToEndOfFile()
    guard data.count > 0, data.count < 131072 else { exit(2) }
    let attrs = [kSecValueData as String: data]
    var status = SecItemUpdate(base as CFDictionary, attrs as CFDictionary)
    if status == errSecItemNotFound {
        var q = base
        q[kSecValueData as String] = data
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        status = SecItemAdd(q as CFDictionary, nil)
    }
    guard status == errSecSuccess else { exit(1) }
} else { exit(2) }
