import AppKit
import QuartzCore

struct PetSpeech: Decodable {
    let id: String, code: String, text: String
    var startedAt: Double
    let endsAt: Double
    let whileBad: Bool?
}
struct PetState: Decodable {
    let sessionId: String
    let remainingMs: Double, durationMs: Double
    let phase: String
    let paused: Bool, bad: Bool
    let badSince: Double?
    let cycle: Int, cycles: Int
    let feedbackVersion: Int?
    let speech: PetSpeech?
    var pose: String { paused ? "paused" : phase == "rest" ? "rest" : bad ? "bad" : "good" }
}
func clamp(_ x: Double) -> Double { min(1, max(0, x)) }
func color(_ hex: UInt32, _ alpha: CGFloat = 1) -> NSColor {
    NSColor(srgbRed: CGFloat(hex >> 16 & 255) / 255, green: CGFloat(hex >> 8 & 255) / 255, blue: CGFloat(hex & 255) / 255, alpha: alpha)
}
func bezier(_ t: Double, _ x1: Double, _ y1: Double, _ x2: Double, _ y2: Double) -> Double {
    func value(_ u: Double, _ a: Double, _ b: Double) -> Double { 3*(1-u)*(1-u)*u*a + 3*(1-u)*u*u*b + u*u*u }
    var low = 0.0, high = 1.0
    for _ in 0..<16 { let mid = (low + high)/2; if value(mid, x1, x2) < t { low = mid } else { high = mid } }
    return value((low + high)/2, y1, y2)
}
/// Values are relative to the unchanged 178×65 bar, matching widgetPresentation.ts.
struct PetGeometry {
    var values: [Double]
    subscript(_ index: Int) -> Double { values[index] }
    static func make(_ state: PetState, _ now: Double, _ height: Double, _ reduced: Bool) -> Self {
        let pose = state.pose
        let growth = !reduced && pose == "bad" ? clamp((now - (state.badSince ?? now))/5000) : 0
        let g = min(growth, clamp((height - 40 - 300)/517))
        let scale = pose == "rest" ? 27.3894/226 : pose == "paused" ? 35.9935/226 : (34.5135 + 96.2405*g)/226
        var left = pose == "rest" ? 2 : pose == "bad" ? 17.21 - 47.62*g : 27.4
        var width = pose == "rest" ? 124.55 : pose == "bad" ? 129.04 + 38.35*g : 110
        let font = 13.2498 + 6.9133*g
        let tracking = pose == "rest" ? -0.308514 : 0.691486 + 0.360794*g
        if state.feedbackVersion == 1 {
            let count = Double(state.speech?.text.unicodeScalars.count ?? 0)
            let next = max(width, count*font + max(0,count-1)*tracking + 24)
            left -= (next - width)/2; width = next
        }
        return Self(values: [g, 860*scale, 1280*scale, 88-650*scale, (pose == "paused" ? -149 : -145)-496.4*g,
                             pose == "rest" ? -60 : 5-78*g, -166-463*g, pose == "rest" ? 238 : 150+141*g, 191.72+447.28*g,
                             left, pose == "rest" ? -160 : -192-517*g, width, 35+18.26*g, 7.71+7.32*g, font, 16+8*g, tracking])
    }
    func between(_ other: Self, _ t: Double) -> Self { Self(values: zip(values, other.values).map { $0 + ($1-$0)*t }) }
}
class FlippedView: NSView {
    override var isFlipped: Bool { true }
    override func setFrameOrigin(_ newOrigin: NSPoint) { if frame.origin != newOrigin { super.setFrameOrigin(newOrigin) } }
    override func setFrameSize(_ newSize: NSSize) { if frame.size != newSize { super.setFrameSize(newSize) } }
}

final class PetButton: NSButton {
    var render: ((CGContext, NSRect) -> Void)?
    private var hovering = false
    override var isFlipped: Bool { true }
    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        for area in trackingAreas { removeTrackingArea(area) }
        addTrackingArea(NSTrackingArea(rect: bounds, options: [.mouseEnteredAndExited, .activeAlways, .inVisibleRect], owner: self))
    }
    override func mouseEntered(with event: NSEvent) { hovering = true; needsDisplay = true }
    override func mouseExited(with event: NSEvent) { hovering = false; needsDisplay = true }
    override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        ctx.saveGState()
        if isHighlighted { ctx.translateBy(x: bounds.midX, y: bounds.midY); ctx.scaleBy(x: 0.96,y: 0.96); ctx.translateBy(x: -bounds.midX,y: -bounds.midY) }
        if hovering { color(0xffffff, 0.5).setFill(); NSBezierPath(roundedRect: bounds, xRadius: 15, yRadius: 15).fill() }
        render?(ctx, bounds)
        ctx.restoreGState()
        if window?.firstResponder === self {
            NSColor.keyboardFocusIndicatorColor.setStroke()
            let path = NSBezierPath(roundedRect: bounds.insetBy(dx: 1,dy: 1), xRadius: 12,yRadius: 12); path.lineWidth = 2; path.stroke()
        }
    }
}

/// Public AppKit renderer for the Store channel; the direct/web widget is unchanged.
public final class PetWidget: NSView {
    public override var isFlipped: Bool { true }
    private let rig: PetRig
    private let shadowView = FlippedView(), maskView = FlippedView(), shakeView = FlippedView()
    private let artwork = FlippedView(), speechView = SpeechView(), bar = BarView()
    private let timeButton = PetButton(), toggleButton = PetButton(), stopButton = PetButton()
    private var state: PetState?
    private var timer: Timer?
    private var geometry: PetGeometry?, geometryStart: PetGeometry?, target: PetGeometry?
    private var geometryAt = 0.0, geometryUpdateAt = 0.0, poseAt = 0.0, compactAt: Double?
    private var compacted = false
    private var shadowGrowth: Double?
    private let action: (String, String) -> Void
    private var reduceObserver: NSObjectProtocol?
    private var reduced: Bool { NSWorkspace.shared.accessibilityDisplayShouldReduceMotion }
    public init(path: String, action: @escaping (String, String) -> Void) throws {
        rig = try PetRig(path: path)
        self.action = action
        super.init(frame: .zero)
        wantsLayer = true; clipsToBounds = false
        autoresizingMask = [.width,.height]
        for view in [shadowView,maskView,shakeView,artwork] { view.wantsLayer = true; view.clipsToBounds = false }
        maskView.clipsToBounds = true
        bar.clipsToBounds = false
        maskView.layer?.masksToBounds = true
        let characterShadow = NSShadow(); characterShadow.shadowColor = color(0, 0.35)
        shadowView.shadow = characterShadow
        addSubview(shadowView); shadowView.addSubview(maskView); maskView.addSubview(shakeView); shakeView.addSubview(artwork); artwork.addSubview(rig)
        addSubview(speechView); addSubview(bar)
        bar.wantsLayer = true; bar.layer?.shadowColor = NSColor.black.cgColor
        bar.layer?.shadowOpacity = 0.25; bar.layer?.shadowOffset = CGSize(width:4,height:6); bar.layer?.shadowRadius = 2
        for button in [timeButton,toggleButton,stopButton] { button.isBordered = false; button.title = ""; button.target = self; button.setButtonType(.momentaryChange); addSubview(button) }
        timeButton.action = #selector(openMain); toggleButton.action = #selector(toggle); stopButton.action = #selector(finish)
        stopButton.setAccessibilityLabel("測定終了")
        timeButton.render = { [weak self] ctx, rect in self?.drawTime(ctx, rect) }
        toggleButton.render = { [weak self] ctx, _ in self?.drawIcon(ctx, self?.state?.paused == true ? "play" : "pause") }
        stopButton.render = { [weak self] ctx, _ in self?.drawIcon(ctx, "stop") }
        setAccessibilityElement(false)
        reduceObserver = NSWorkspace.shared.notificationCenter.addObserver(forName: NSWorkspace.accessibilityDisplayOptionsDidChangeNotification, object: nil, queue: .main) { [weak self] _ in
            guard let self, let state = self.state else { return }; self.rig.setPose(state.pose, reducedMotion: self.reduced); self.tick()
        }
    }
    required init?(coder: NSCoder) { nil }
    deinit { timer?.invalidate(); if let observer = reduceObserver { NSWorkspace.shared.notificationCenter.removeObserver(observer) } }
    public func update(json: Data?) throws {
        let next = try json.map { try JSONDecoder().decode(PetState.self, from: $0) }
        let now = Date().timeIntervalSince1970*1000
        let fresh = next?.sessionId != state?.sessionId
        let changed = next?.pose != state?.pose
        state = next
        guard let next else { timer?.invalidate(); timer = nil; rig.animationView.pause(); isHidden = true; speechView.reset(); geometry = nil; return }
        isHidden = false
        if fresh { speechView.reset(); geometry = nil }
        if changed || fresh {
            poseAt = now; compactAt = next.pose != "bad" ? now+1100 : nil; compacted = false
            rig.setPose(next.pose, reducedMotion: fresh || reduced)
        }
        speechView.update(next.speech, bad: next.pose == "bad", now: now, reduced: reduced)
        toggleButton.setAccessibilityLabel(next.paused ? "再開" : "一時停止")
        let context = next.paused ? "一時停止中" : next.phase == "rest" ? "休憩中" : "集中中"
        timeButton.setAccessibilityLabel("\(context)、残り\(timeLabel(next))、\(next.cycle) / \(next.cycles) サイクル。メイン画面を開く")
        if timer == nil { let t = Timer(timeInterval: 1/60, repeats: true) { [weak self] _ in self?.tick() }; RunLoop.main.add(t,forMode: .common); timer = t }
        bar.state = next; bar.needsDisplay = true
        for button in [timeButton,toggleButton,stopButton] { button.needsDisplay = true }
        tick()
    }
    public override func setFrameSize(_ newSize: NSSize) {
        let changed = frame.size != newSize
        super.setFrameSize(newSize)
        if changed { tick() }
    }
    private func tick() {
        guard let state else { return }
        let now = Date().timeIntervalSince1970*1000
        let next = PetGeometry.make(state, now, bounds.height, reduced)
        if geometry == nil || reduced { geometry = next; target = next; geometryStart = next; geometryAt = now }
        let duration = state.pose == "bad" ? 60.0 : 600.0
        let t = clamp((now-geometryAt)/duration)
        if let start = geometryStart, let target { geometry = start.between(target, state.pose == "bad" ? t : bezier(t,0.2,0.75,0.34,0.94)) }
        if target?.values != next.values && (state.pose != "bad" || now-geometryUpdateAt >= 50) {
            geometryStart = geometry; target = next; geometryAt = now; geometryUpdateAt = now
        }
        guard let g = geometry else { return }
        let origin = CGPoint(x: (bounds.width-178)/2,y: bounds.height-36-65)
        CATransaction.begin(); CATransaction.setDisableActions(true)
        shadowView.frame = NSRect(x: origin.x+g[5],y: origin.y+g[6],width: g[7],height: g[8])
        maskView.frame = shadowView.bounds; shakeView.frame = maskView.bounds; artwork.frame = shakeView.bounds
        let rigFrame = NSRect(x: g[3]-g[5],y: g[4]-g[6],width: g[1],height: g[2])
        if rig.frame != rigFrame { rig.frame = rigFrame }
        if shadowGrowth != g[0] {
            shadowGrowth = g[0]
            let characterShadow = NSShadow(); characterShadow.shadowColor = color(0, 0.35)
            characterShadow.shadowOffset = CGSize(width: 3.4049+g[0]*9.4946,height: -(3.4049+g[0]*9.4946))
            characterShadow.shadowBlurRadius = 6.8098+g[0]*18.9891
            shadowView.shadow = characterShadow
        }
        let shake = !reduced && state.pose == "bad" ? angryShake((now-poseAt)/680) : (0.0,0.0)
        var transform = CATransform3DIdentity
        let ax = 88-g[5], ay = g[8]
        transform = CATransform3DTranslate(transform,ax+shake.0,ay,0)
        transform = CATransform3DRotate(transform,shake.1 * .pi/180,0,0,1)
        transform = CATransform3DTranslate(transform,-ax,-ay,0)
        artwork.layer?.anchorPoint = .zero; artwork.layer?.position = .zero; artwork.layer?.transform = transform
        speechView.frame = NSRect(x: origin.x+g[9]-50, y: origin.y+g[10]-50, width: g[11]+100, height: g[12]+140)
        speechView.origin = CGPoint(x:50-g[9], y:50-g[10]); speechView.geometry = g
        speechView.tick(now: now, reduced: reduced)
        bar.frame = NSRect(origin: origin,size: CGSize(width:178,height:65))
        timeButton.frame = NSRect(x: origin.x+(state.pose == "rest" ? 18 : 21),y: origin.y+10,width: state.pose == "rest" ? 85 : 82,height:33)
        toggleButton.frame = NSRect(x:origin.x+103,y:origin.y+11,width:30,height:30)
        stopButton.frame = NSRect(x:origin.x+133,y:origin.y+11,width:30,height:30)
        CATransaction.commit()
        if let at = compactAt, now >= at, !compacted { compacted = true; action("compact",state.sessionId) }
        if (state.pose != "bad" || reduced) && t >= 1 && !speechView.isAnimating(now) && (compactAt == nil || compacted) {
            timer?.invalidate(); timer = nil
        }
    }
    private func timeLabel(_ state: PetState) -> String {
        let seconds = Int(ceil(max(0,min(max(1,state.durationMs),state.remainingMs))/1000))
        return String(format:"%02d:%02d",seconds/60,seconds%60)
    }
    private func drawTime(_ ctx: CGContext, _ rect: NSRect) {
        guard let state else { return }
        let text = timeLabel(state), long = text.count > 5
        let font = NSFont.systemFont(ofSize:long ? 22 : 27.6279,weight:.bold)
        let line = NSAttributedString(string:text, attributes:[.font:font,.foregroundColor:color(state.pose == "rest" ? 0x6e4211 : 0x111f6e),.kern:long ? 0.2 : 1.15116])
        let size = line.size(); ctx.saveGState(); ctx.scaleBy(x:min(1,rect.width/max(1,size.width)),y:1)
        line.draw(at:CGPoint(x:0,y:(rect.height-size.height)/2)); ctx.restoreGState()
    }
    private func drawIcon(_ ctx: CGContext, _ name: String) {
        ctx.saveGState(); ctx.scaleBy(x:30/64,y:30/64); ctx.addPath(WidgetIcons.path(name)); ctx.setFillColor(color(name == "play" ? 0x11ba45 : 0xea4949).cgColor); ctx.fillPath(); ctx.restoreGState()
    }
    @objc private func openMain() { send("open") }
    @objc private func toggle() { send(state?.paused == true ? "resume" : "pause") }
    @objc private func finish() { send("finish") }
    private func send(_ command: String) { if let state { action(command,state.sessionId) } }
    public override func hitTest(_ point: NSPoint) -> NSView? {
        let local = convert(point,from:superview)
        for button in [timeButton,toggleButton,stopButton] where button.frame.contains(local) { return button }
        if shadowView.frame.contains(local) || speechView.bubbleHit.offsetBy(dx:speechView.frame.minX,dy:speechView.frame.minY).contains(local) { return self }
        return nil
    }
    public override func mouseDown(with event: NSEvent) { send("drag") }
}
func angryShake(_ cycles: Double) -> (Double,Double) {
    let time = cycles - floor(cycles)
    let points: [(Double,Double,Double)] = [(0,0,0),(0.12,-2,-1.2),(0.26,2,1.6),(0.40,-2,-1.6),(0.55,2,1.3),(0.70,-1,-0.9),(0.84,1,0.6),(1,0,0)]
    for i in 1..<points.count where time <= points[i].0 {
        let a=points[i-1],b=points[i], t=bezier((time-a.0)/(b.0-a.0),0.42,0,0.58,1)
        return (a.1+(b.1-a.1)*t,a.2+(b.2-a.2)*t)
    }
    return (0,0)
}
final class BarView: FlippedView {
    var state: PetState?
    override func draw(_ dirtyRect: NSRect) {
        guard let state, let ctx=NSGraphicsContext.current?.cgContext else { return }
        let rest=state.pose == "rest"
        ctx.saveGState()
        color(rest ? 0xf6edd8 : 0xecf8fc).setFill();NSBezierPath(roundedRect:bounds,xRadius:32.5,yRadius:32.5).fill();ctx.restoreGState()
        color(0xffffff).setFill();NSBezierPath(roundedRect:NSRect(x:15,y:46,width:148,height:8),xRadius:4,yRadius:4).fill()
        color(rest ? 0xf78000 : 0x13a2d7).setFill();NSBezierPath(roundedRect:NSRect(x:15,y:46,width:148*clamp(state.remainingMs/max(1,state.durationMs)),height:8),xRadius:4,yRadius:4).fill()
    }
}
final class SpeechView: FlippedView {
    var geometry: PetGeometry?, origin = CGPoint.zero, bubbleHit = NSRect.zero
    private var shown: PetSpeech?, pending: PetSpeech?, bad=false, pendingBad=false
    private var leaving: Double?, now=0.0, reduced=false
    func reset() { shown=nil;pending=nil;leaving=nil;bad=false }
    func isAnimating(_ at:Double) -> Bool { leaving != nil || shown.map { ($0.whileBad == true && bad) || at < $0.endsAt } == true }
    func update(_ speech: PetSpeech?, bad: Bool, now: Double, reduced: Bool) {
        let incoming = speech?.whileBad == true && !bad && now >= (speech?.endsAt ?? 0) ? nil : speech
        if leaving != nil, pending?.id == incoming?.id { pendingBad=bad; return }
        if shown?.id == incoming?.id { self.bad=bad;leaving=nil;return }
        if reduced || shown == nil || (!(shown!.whileBad == true && self.bad) && now >= shown!.endsAt) { replace(incoming,bad:bad,now:now);return }
        pending=incoming;pendingBad=bad;leaving=now
    }
    private func replace(_ event: PetSpeech?, bad: Bool, now: Double) {
        shown=event
        if shown != nil { shown!.startedAt=max(shown!.startedAt,now) }
        self.bad=bad;leaving=nil;pending=nil
        setAccessibilityElement(event != nil)
        setAccessibilityRole(.staticText)
        setAccessibilityLabel(event?.text)
    }
    func tick(now: Double,reduced: Bool) {
        self.now=now;self.reduced=reduced
        if let at=leaving,now-at>=300 { replace(pending,bad:pendingBad,now:now) }
        needsDisplay=true
    }
    override func draw(_ dirtyRect: NSRect) {
        bubbleHit = .zero
        guard let event=shown,let g=geometry,let ctx=NSGraphicsContext.current?.cgContext else { return }
        let time=leaving ?? now, age=time-event.startedAt,persistent=event.whileBad == true && bad
        guard age>=0,persistent || time<event.endsAt else { return }
        let enter=reduced ? 1 : 1-pow(1-clamp(age/280),3)
        let exitProgress=persistent || reduced ? 0 : clamp((time-(event.endsAt-320))/320)
        let exit=1-exitProgress*exitProgress*(3-2*exitProgress)
        let phase=clamp((age-280)/900)
        let angle=reduced ? 0 : sin(phase * .pi*4)*1.5*(1-phase)+(persistent ? sin(max(0,age-1180)/2600 * .pi*2)*1.2 : 0)
        let leave=leaving.map { reduced ? 1 : bezier(clamp((now-$0)/300),0.4,0,0.2,1) } ?? 0
        let y=reduced ? 0 : 3*(1-enter)+3*(1-exit)+3*leave
        let w=g[11],h=g[12],x=origin.x+g[9],top=origin.y+g[10]
        bubbleHit=NSRect(x:x,y:top,width:w,height:h+20).insetBy(dx:-10,dy:-10)
        ctx.saveGState();ctx.setAlpha(enter*exit*(1-leave))
        ctx.translateBy(x:x+w/2,y:top+h/2);ctx.rotate(by:g[13] * .pi/180);ctx.translateBy(x:-w/2,y:-h/2)
        ctx.translateBy(x:w/2,y:h*0.85+y);ctx.rotate(by:angle * .pi/180);ctx.translateBy(x:-w/2,y:-h*0.85)
        let shape=CGMutablePath();shape.addRoundedRect(in:CGRect(x:0,y:0,width:w,height:h),cornerWidth:h/2,cornerHeight:h/2)
        let tw=21.42+11.18*g[0],th=19.04+9.94*g[0],tx=w*0.47,ty=h*0.75
        shape.move(to:CGPoint(x:tx,y:ty));shape.addLine(to:CGPoint(x:tx+tw,y:ty));shape.addLine(to:CGPoint(x:tx+tw*0.28,y:ty+th));shape.closeSubpath()
        ctx.saveGState();ctx.setShadow(offset:CGSize(width:0,height:-4),blur:4,color:color(0,0.25).cgColor);ctx.setFillColor(NSColor.white.cgColor);ctx.addPath(shape);ctx.fillPath();ctx.restoreGState()
        let line=NSAttributedString(string:event.text,attributes:[.font:NSFont.systemFont(ofSize:g[14],weight:NSFont.Weight(rawValue:0.25)),.foregroundColor:NSColor.black,.kern:g[16]])
        let size=line.size();line.draw(at:CGPoint(x:(w-size.width)/2,y:(h-size.height)/2))
        ctx.restoreGState()
    }
}
