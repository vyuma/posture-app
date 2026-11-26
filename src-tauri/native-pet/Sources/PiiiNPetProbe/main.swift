import AppKit
import PiiiNPetNative

final class Probe: NSObject, NSApplicationDelegate {
    var window: NSWindow!, panel: NSPanel!, widget: PetWidget!
    var inspection: PetWidget!
    var mode = "good"
    var sequence=0
    func applicationDidFinishLaunching(_ notification: Notification) {
        let path = Bundle.main.resourceURL!.appendingPathComponent("widget-states-v2.json").path
        window=NSWindow(contentRect:NSRect(x:0,y:0,width:980,height:820),styleMask:[.titled,.closable],backing:.buffered,defer:false)
        window.title="PiiiN Native Widget Parity Probe";window.isReleasedWhenClosed=false
        for (i,title) in ["Good","Bad / Grow","Rest","Paused","Hide","New praise"].enumerated() {
            let button=NSButton(title:title,target:self,action:#selector(change(_:)))
            button.tag=i;button.frame=NSRect(x:20+(i%3)*150,y:710-(i/3)*45,width:140,height:32);window.contentView!.addSubview(button)
        }
        let label=NSTextField(labelWithString:"Existing 178×65 timer. Drag the character. No camera.")
        label.frame=NSRect(x:20,y:610,width:440,height:24);window.contentView!.addSubview(label)
        panel=NSPanel(contentRect:NSRect(x:80,y:150,width:400,height:870),styleMask:[.nonactivatingPanel],backing:.buffered,defer:false)
        panel.isOpaque=false;panel.backgroundColor = .clear;panel.hasShadow=false;panel.hidesOnDeactivate=false;panel.level = .floating
        panel.collectionBehavior=[.canJoinAllSpaces,.fullScreenAuxiliary];panel.isReleasedWhenClosed=false
        do { widget=try PetWidget(path:path) { [weak self] action,session in
            guard let self else { return }
            if action == "drag",let event=NSApp.currentEvent { self.panel.performDrag(with:event) }
            else if action == "pause" { self.set("paused") }
            else if action == "resume" { self.set("good") }
            else if action == "finish" { self.panel.orderOut(nil) }
            else if action == "open" { self.window.makeKeyAndOrderFront(nil);NSApp.activate(ignoringOtherApps:true) }
        }} catch { fatalError(String(describing:error)) }
        inspection=try! PetWidget(path:path) { _,_ in }
        inspection.frame=NSRect(x:540,y:0,width:400,height:780)
        window.contentView!.addSubview(inspection)
        window.backgroundColor=NSColor(srgbRed:0.075,green:0.635,blue:0.843,alpha:1)
        panel.contentView=widget
        if let screen=NSScreen.main { let area=screen.visibleFrame;panel.setFrame(NSRect(x:area.maxX-430,y:area.minY,width:400,height:min(870,area.height)),display:true) }
        window.center();window.makeKeyAndOrderFront(nil);NSApp.activate(ignoringOtherApps:true)
        set("good")
    }
    @objc func change(_ sender:NSButton) {
        if sender.tag == 4 { panel.orderOut(nil);try? widget.update(json:nil);try? inspection.update(json:nil);return }
        set(["good","bad","rest","paused","good","good"][sender.tag])
    }
    func set(_ pose:String) {
        mode=pose;sequence+=1
        let now=Date().timeIntervalSince1970*1000
        let text=pose == "bad" ? "姿勢を戻して！" : pose == "rest" ? "ストレッチした？" : pose == "paused" ? "お疲れさま！" : "いい感じ！"
        var state:[String:Any] = ["sessionId":"probe","phase":pose == "rest" ? "rest" : "focus","remainingMs":923000,"durationMs":1500000,"cycle":1,"cycles":2,"paused":pose == "paused","bad":pose == "bad","feedbackVersion":1,"speech":["id":"probe-\(sequence)","code":pose,"text":text,"startedAt":now,"endsAt":now+6500,"whileBad":pose == "bad"]]
        if pose == "bad" { state["badSince"]=now }
        let data=try! JSONSerialization.data(withJSONObject:state)
        try! widget.update(json:data);try! inspection.update(json:data);panel.orderFrontRegardless()
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender:NSApplication)->Bool { true }
}
let app=NSApplication.shared
app.setActivationPolicy(.regular)
let delegate=Probe();app.delegate=delegate;app.run()
