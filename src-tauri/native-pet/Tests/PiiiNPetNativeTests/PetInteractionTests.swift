import AppKit
import XCTest
@testable import PiiiNPetNative

final class PetInteractionTests: XCTestCase {
    func testSurfaceClicksOpenAndDragsAndControlsRemainSeparate() throws {
        _ = NSApplication.shared
        let path = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("public/animations/anago/normal-nago/widget-states-v2.json").path
        var actions: [String] = []
        let widget = try PetWidget(path: path) { command, _ in actions.append(command) }
        let window = NSWindow(contentRect: NSRect(x:0,y:0,width:400,height:870), styleMask:[.borderless], backing:.buffered, defer:false)
        window.contentView = widget
        XCTAssertTrue(widget.acceptsFirstMouse(for:nil))
        defer { try? widget.update(json:nil); withExtendedLifetime(window) {} }
        try widget.update(json: JSONSerialization.data(withJSONObject: ["sessionId":"interaction-test", "remainingMs":60000, "durationMs":120000, "phase":"focus", "paused":false, "bad":false, "cycle":1, "cycles":2]))
        func hit(_ point: NSPoint) -> NSView? { widget.hitTest(widget.convert(point, to:widget.superview)) }
        func event(_ type: NSEvent.EventType, _ point: NSPoint) -> NSEvent {
            NSEvent.mouseEvent(with:type, location:widget.convert(point,to:nil), modifierFlags:[], timestamp:ProcessInfo.processInfo.systemUptime, windowNumber:window.windowNumber, context:nil, eventNumber:1, clickCount:1, pressure:1)!
        }
        // Character, timer background and progress. Transparent window corners pass through.
        for point in [NSPoint(x:180,y:680), NSPoint(x:120,y:801), NSPoint(x:160,y:819)] {
            XCTAssertTrue(hit(point) === widget)
            widget.mouseDown(with:event(.leftMouseDown,point)); widget.mouseUp(with:event(.leftMouseUp,point))
        }
        XCTAssertEqual(actions, ["open","open","open"])
        XCTAssertNil(hit(NSPoint(x:10,y:10)))
        actions.removeAll()
        let start = NSPoint(x:180,y:680), moved = NSPoint(x:200,y:680)
        widget.mouseDown(with:event(.leftMouseDown,start)); widget.mouseDragged(with:event(.leftMouseDragged,moved)); widget.mouseDragged(with:event(.leftMouseDragged,start)); widget.mouseUp(with:event(.leftMouseUp,start))
        XCTAssertEqual(actions,["drag"])
        actions.removeAll()
        for point in [NSPoint(x:155,y:795), NSPoint(x:230,y:795), NSPoint(x:260,y:795)] {
            let button = try XCTUnwrap(hit(point) as? NSButton)
            button.performClick(nil)
        }
        XCTAssertEqual(actions,["open","pause","finish"])
        actions.removeAll()
        widget.mouseDown(with:event(.leftMouseDown,start)); try widget.update(json:nil); widget.mouseUp(with:event(.leftMouseUp,start))
        XCTAssertTrue(actions.isEmpty)
    }
}
