import AppKit
import XCTest
@testable import Lottie
@testable import PiiiNPetNative

/// Exercise the real AppKit/Lottie renderer in an offscreen window. A bare view
/// does not attach its animation layers and would miss completion-time sweeps.
final class PetPlaybackTests: XCTestCase {
    private let still: [String: Double] = ["good": 0, "bad": 1, "rest": 2, "paused": 408]
    private let transitions: [(String, String, Double, Double)] = [
        ("good", "bad", 183, 213), ("bad", "good", 213, 288),
        ("good", "rest", 288, 318), ("rest", "good", 318, 348),
        ("bad", "rest", 348, 378), ("rest", "bad", 378, 408),
        ("good", "paused", 409, 439), ("paused", "good", 439, 469),
        ("bad", "paused", 469, 499), ("paused", "bad", 499, 529),
        ("rest", "paused", 529, 559), ("paused", "rest", 559, 589)
    ]
    private var assetPath: String {
        URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("public/animations/anago/normal-nago/widget-states-v2.json").path
    }
    private func host(_ view: NSView) -> NSWindow {
        _ = NSApplication.shared
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 400, height: 870),
                              styleMask: [.borderless], backing: .buffered, defer: false)
        window.contentView = view
        view.layoutSubtreeIfNeeded()
        CATransaction.flush()
        return window
    }
    private func sample(_ rig: PetRig, seconds: Double, ranges: [Range<Double>],
                        update: (() throws -> Void)? = nil) throws {
        let root = try XCTUnwrap(rig.animationView.lottieAnimationLayer.animationLayer)
        let until = Date().addingTimeInterval(seconds)
        var unexpected = Set<String>()
        while Date() < until {
            try update?()
            RunLoop.main.run(until: Date().addingTimeInterval(0.005))
            for key in root.animationKeys() ?? [] {
                guard let animation = root.animation(forKey: key) as? CABasicAnimation,
                      animation.keyPath == "currentFrame" else { continue }
                if key == "currentFrame" {
                    unexpected.insert("Implicit sweep from \(String(describing: animation.fromValue)) to \(rig.animationView.currentFrame)")
                } else if let from = animation.fromValue as? Double,
                          let to = animation.toValue as? Double,
                          ranges.contains(where: { $0.contains(from) && $0.contains(to) }) {
                    // Explicit playback stays inside the requested transition(s).
                } else {
                    unexpected.insert("Out-of-range segment \(key): \(String(describing: animation.fromValue)) → \(String(describing: animation.toValue))")
                }
            }
        }
        XCTAssertTrue(unexpected.isEmpty, unexpected.sorted().joined(separator: "\n"))
    }
    private func assertSettled(_ rig: PetRig, _ pose: String) {
        XCTAssertFalse(rig.animationView.isAnimationPlaying)
        XCTAssertEqual(rig.animationView.currentFrame, still[pose]!, accuracy: 0.0001)
    }
    func testAllPoseTransitionsStayInsideTheirOwnFrames() throws {
        _ = NSApplication.shared
        let rig = try PetRig(path: assetPath)
        let window = host(rig)
        defer { withExtendedLifetime(window) {} }
        rig.animationView.animationSpeed = 8
        for (from, to, start, end) in transitions {
            rig.setPose(from, reducedMotion: true)
            CATransaction.flush()
            rig.setPose(to, reducedMotion: false)
            XCTAssertTrue(rig.animationView.isAnimationPlaying, "\(from) → \(to) must actually play")
            try sample(rig, seconds: (end-start)/30/8 + 0.32, ranges: [start..<end])
            assertSettled(rig, to)
        }
    }
    func testRapidRequestsQueueOnlyTheRequiredTransitions() throws {
        _ = NSApplication.shared
        let rig = try PetRig(path: assetPath)
        let window = host(rig)
        defer { withExtendedLifetime(window) {} }
        rig.animationView.animationSpeed = 8
        rig.setPose("bad", reducedMotion: false)
        rig.setPose("paused", reducedMotion: false)
        rig.setPose("rest", reducedMotion: false)
        try sample(rig, seconds: 0.7, ranges: [183..<213, 348..<378])
        assertSettled(rig, "rest")
        rig.setPose("good", reducedMotion: false)
        rig.setPose("paused", reducedMotion: true)
        try sample(rig, seconds: 0.35, ranges: [])
        assertSettled(rig, "paused")
        rig.setPose("good", reducedMotion: false)
        try sample(rig, seconds: 0.5, ranges: [439..<469])
        assertSettled(rig, "good")
    }
    func testWidgetSnapshotsAndGrowthDoNotIntroduceOtherPoses() throws {
        _ = NSApplication.shared
        let widget = try PetWidget(path: assetPath, action: { _,_ in })
        let window = host(widget)
        defer { withExtendedLifetime(window) {}; try? widget.update(json: nil) }
        func findRig(_ view: NSView) -> PetRig? {
            if let rig = view as? PetRig { return rig }
            return view.subviews.lazy.compactMap(findRig).first
        }
        let rig = try XCTUnwrap(findRig(widget))
        let now = Date().timeIntervalSince1970*1000
        func update(_ bad: Bool, phase: String = "focus") throws {
            try widget.update(json: JSONSerialization.data(withJSONObject: [
                "sessionId": "playback-test", "remainingMs": 60_000, "durationMs": 120_000,
                "phase": phase, "paused": false, "bad": bad,
                "badSince": now-4_000, "cycle": 1, "cycles": 2, "feedbackVersion": 1
            ]))
            widget.layoutSubtreeIfNeeded()
        }
        try update(false)
        try sample(rig, seconds: 0.3, ranges: []) { try update(false) }
        assertSettled(rig, "good")
        try update(true)
        try sample(rig, seconds: 1.35, ranges: [183..<213]) { try update(true) }
        assertSettled(rig, "bad")
        try update(false, phase: "rest")
        try sample(rig, seconds: 1.35, ranges: [348..<378]) { try update(false, phase: "rest") }
        assertSettled(rig, "rest")
    }
}
