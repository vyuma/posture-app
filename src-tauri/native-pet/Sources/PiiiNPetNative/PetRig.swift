import AppKit
import Lottie

/// Preserve the source file and frame ranges used by WidgetPetRig.tsx.
/// This renderer is kept separate until visual parity with the shipping pet is verified.
public final class PetRig: NSView {
    public override var isFlipped: Bool { true }
    public let animationView: LottieAnimationView
    private var current = "good"
    private var desired = "good"
    private var moving = false
    private let still: [String: AnimationFrameTime] = ["good": 0, "bad": 1, "rest": 2, "paused": 408]
    private let transitions: [String: (AnimationFrameTime, AnimationFrameTime)] = [
        "good:bad": (183, 212), "bad:good": (213, 287),
        "good:rest": (288, 317), "rest:good": (318, 347),
        "bad:rest": (348, 377), "rest:bad": (378, 407),
        "good:paused": (409, 438), "paused:good": (439, 468),
        "bad:paused": (469, 498), "paused:bad": (499, 528),
        "rest:paused": (529, 558), "paused:rest": (559, 588)
    ]
    public init(path: String) throws {
        // lottie-web treats a layer's op as exclusive; native main-thread Lottie
        // uses an inclusive comparison. Adapt only that boundary in memory.
        // The committed animation, curves, colors and frame ranges are unchanged.
        let source = try Data(contentsOf: URL(fileURLWithPath: path))
        var object = try JSONSerialization.jsonObject(with: source) as! [String: Any]
        func exclusiveLayers(_ layers: [[String: Any]]) -> [[String: Any]] {
            layers.map { layer in
                var result = layer
                if let end = result["op"] as? Double { result["op"] = end.nextDown }
                return result
            }
        }
        if let layers = object["layers"] as? [[String: Any]] { object["layers"] = exclusiveLayers(layers) }
        if let assets = object["assets"] as? [[String: Any]] {
            object["assets"] = assets.map { asset in
                var result = asset
                if let layers = result["layers"] as? [[String: Any]] { result["layers"] = exclusiveLayers(layers) }
                return result
            }
        }
        let animation = try LottieAnimation.from(data: JSONSerialization.data(withJSONObject: object))
        animationView = LottieAnimationView(animation: animation, configuration: LottieConfiguration(renderingEngine: .mainThread))
        super.init(frame: .zero)
        wantsLayer = true
        clipsToBounds = false
        animationView.clipsToBounds = false
        animationView.maskAnimationToBounds = false
        animationView.backgroundBehavior = .continuePlaying
        addSubview(animationView)
        animationView.currentFrame = 0
    }
    required init?(coder: NSCoder) { nil }
    public override func layout() {
        super.layout()
        animationView.frame = bounds
    }
    public func setPose(_ pose: String, reducedMotion: Bool) {
        guard still[pose] != nil else { return }
        desired = pose
        if reducedMotion {
            animationView.stop()
            current = desired
            moving = false
            animationView.currentFrame = still[current]!
        } else { advance() }
    }
    private func advance() {
        guard !moving, current != desired else { return }
        let next = desired
        let range = transitions[current + ":" + next]
        current = next
        guard let range else { animationView.currentFrame = still[current]!; return }
        moving = true
        // Web segment ends are exclusive. Keep its duration without sampling the next pose.
        animationView.play(fromFrame: range.0, toFrame: (range.1 + 1).nextDown, loopMode: .playOnce) { [weak self] finished in
            guard let self, finished else { return }
            self.moving = false
            self.animationView.currentFrame = self.still[self.current]!
            // Lottie 4.6.1's completion delegate writes currentFrame before this
            // callback, adding a Core Animation implicit sweep across the atlas.
            // Remove only that implicit animation; explicit pose segments stay intact.
            let playback = self.animationView.layer?.sublayers?.compactMap { $0 as? LottieAnimationLayer }.first
            playback?.animationLayer?.removeAnimation(forKey: "currentFrame")
            self.animationView.forceDisplayUpdate()
            self.advance()
        }
    }
}
