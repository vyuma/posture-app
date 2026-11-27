import XCTest
@testable import PiiiNPetNative
final class PetContractTests: XCTestCase {
    struct Case: Decodable {
        let width: Double?
        let name: String, state: PetState, height: Double, reduced: Bool, now: Double, expected:[Double]
    }
    func testGeometryContractWithIdenticalFontMetrics() throws {
        let url=Bundle.module.url(forResource:"presentation",withExtension:"json",subdirectory:"Fixtures")!
        let cases=try JSONDecoder().decode([Case].self,from:Data(contentsOf:url))
        XCTAssertEqual(cases.count,78)
        for sample in cases {
            let actual=PetGeometry.make(sample.state,sample.now,sample.height,sample.reduced,sample.width ?? .infinity, measure: { text, font, tracking in
                text.unicodeScalars.reduce(0) { total, char in
                    total + (CharacterSet.whitespaces.contains(char) ? 0.3 : char.isASCII ? 0.65 : 1)*font + tracking
                }
            })
            XCTAssertEqual(actual.values.count,sample.expected.count)
            for (index,expected) in sample.expected.enumerated() {
                XCTAssertEqual(actual.values[index],expected,accuracy:0.000001,"\(sample.name), property \(index)")
            }
        }
    }
    func testActualFontsKeepPaddingAndLineHeightAtEveryGrowthSize() {
        for text in ["首が曲がってるよ！", "顔が近い！", "오른쪽 어깨가 올라갔어!", "Right shoulder higher! Reset your chin position!"] {
            let state=PetState(sessionId:"layout", language:nil, remainingMs:1000, durationMs:1000, phase:"focus", paused:false, bad:true, badSince:1000, cycle:1, cycles:1, feedbackVersion:1,
                               speech:PetSpeech(id:"a",code:"test",text:text,startedAt:1000,endsAt:10000,whileBad:true))
            for width in [320.0,390,1512] { for now in [1000.0,3500,6000] {
                let g=PetGeometry.make(state,now,870,false,width)
                let lines=speechLines(text,g.speechMaxWidth-60,g[14],g[16])
                for line in lines { XCTAssertGreaterThanOrEqual((g[11]-speechTextWidth(line,g[14],g[16]))/2,29.99) }
                XCTAssertEqual(g[12]-Double(lines.count)*g[15],19+10.26*g[0],accuracy:0.0001)
                XCTAssertLessThanOrEqual(g[11],width-64)
            }}
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
