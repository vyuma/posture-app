// swift-tools-version: 5.9
import PackageDescription
let package = Package(
    name: "PiiiNPetNative",
    platforms: [.macOS(.v12)],
    products: [.library(name: "PiiiNPetNative", type: .static, targets: ["PiiiNPetNative"]), .executable(name: "PiiiNPetProbe", targets: ["PiiiNPetProbe"])],
    dependencies: [.package(url: "https://github.com/airbnb/lottie-ios.git", exact: "4.6.1")],
    targets: [.target(name: "PiiiNPetNative", dependencies: [.product(name: "Lottie", package: "lottie-ios")]), .executableTarget(name: "PiiiNPetProbe", dependencies: ["PiiiNPetNative"]), .testTarget(name: "PiiiNPetNativeTests", dependencies: ["PiiiNPetNative"], resources: [.copy("Fixtures")])]
)
