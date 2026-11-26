import AppKit
public typealias PetActionCallback = @convention(c) (UnsafePointer<CChar>, UnsafePointer<CChar>) -> Void
@_cdecl("piiin_pet_create")
public func createPet(_ path: UnsafePointer<CChar>, _ callback: @escaping PetActionCallback) -> UnsafeMutableRawPointer? {
    precondition(Thread.isMainThread)
    do {
        let view = try PetWidget(path:String(cString:path)) { action,session in
            action.withCString { a in session.withCString { s in callback(a,s) } }
        }
        return Unmanaged.passRetained(view).toOpaque()
    } catch { NSLog("PiiiN native pet initialization failed: %@",String(describing:error));return nil }
}
@_cdecl("piiin_pet_update")
public func updatePet(_ view:UnsafeMutableRawPointer,_ json:UnsafePointer<CChar>?) -> Bool {
    precondition(Thread.isMainThread)
    do {
        let widget=Unmanaged<PetWidget>.fromOpaque(view).takeUnretainedValue()
        try widget.update(json:json.map { Data(String(cString:$0).utf8) });return true
    } catch { NSLog("PiiiN native pet state failed: %@",String(describing:error));return false }
}
