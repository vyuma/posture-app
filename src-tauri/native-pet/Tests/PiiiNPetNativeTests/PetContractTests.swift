import XCTest
@testable import PiiiNPetNative
final class PetContractTests: XCTestCase {
    struct Case: Decodable {
        let name: String, state: PetState, height: Double, reduced: Bool, now: Double, expected:[Double]
    }
    func testGeometryAgainstShippingWebWidget() throws {
        let url=Bundle.module.url(forResource:"presentation",withExtension:"json",subdirectory:"Fixtures")!
        let cases=try JSONDecoder().decode([Case].self,from:Data(contentsOf:url))
        XCTAssertEqual(cases.count,74)
        for sample in cases {
            let actual=PetGeometry.make(sample.state,sample.now,sample.height,sample.reduced)
            XCTAssertEqual(actual.values.count,sample.expected.count)
            for (index,expected) in sample.expected.enumerated() {
                XCTAssertEqual(actual.values[index],expected,accuracy:0.000001,"\(sample.name), property \(index)")
            }
        }
    }
    @MainActor func testLanguageChangeUpdatesCurrentAndPendingSpeech() {
        let view=SpeechView(frame:.zero)
        func event(_ id:String,_ text:String) -> PetSpeech {
            PetSpeech(id:id,code:"test",text:text,startedAt:0,endsAt:5000,whileBad:true)
        }
        view.update(event("a","顔を上げよう"),bad:true,now:0,reduced:false)
        view.update(event("a","Lift your head"),bad:true,now:500,reduced:false)
        XCTAssertEqual(view.accessibilityLabel(),"Lift your head")
        view.update(event("b","肩をそろえよう"),bad:true,now:600,reduced:false)
        view.update(event("b","어깨를 나란히"),bad:true,now:700,reduced:false)
        view.tick(now:900,reduced:false)
        XCTAssertEqual(view.accessibilityLabel(),"어깨를 나란히")
    }
    func testShakeLoopsAtExactlyTheOriginalKeyframes() {
        XCTAssertEqual(angryShake(0).0,0,accuracy:0.001)
        XCTAssertEqual(angryShake(1).0,0,accuracy:0.001)
        XCTAssertEqual(angryShake(0.26).0,2,accuracy:0.001)
        XCTAssertEqual(angryShake(0.26).1,1.6,accuracy:0.001)
        XCTAssertEqual(angryShake(17.26).1,1.6,accuracy:0.001)
    }
}
