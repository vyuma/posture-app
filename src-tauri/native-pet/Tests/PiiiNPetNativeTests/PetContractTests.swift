import XCTest
@testable import PiiiNPetNative
final class PetContractTests: XCTestCase {
    struct Case: Decodable {
        let name: String, state: PetState, height: Double, reduced: Bool, now: Double, expected:[Double]
    }
    func testGeometryAgainstShippingWebWidget() throws {
        let url=Bundle.module.url(forResource:"presentation",withExtension:"json",subdirectory:"Fixtures")!
        let cases=try JSONDecoder().decode([Case].self,from:Data(contentsOf:url))
        XCTAssertEqual(cases.count,72)
        for sample in cases {
            let actual=PetGeometry.make(sample.state,sample.now,sample.height,sample.reduced)
            XCTAssertEqual(actual.values.count,sample.expected.count)
            for (index,expected) in sample.expected.enumerated() {
                XCTAssertEqual(actual.values[index],expected,accuracy:0.000001,"\(sample.name), property \(index)")
            }
        }
    }
    func testShakeLoopsAtExactlyTheOriginalKeyframes() {
        XCTAssertEqual(angryShake(0).0,0,accuracy:0.001)
        XCTAssertEqual(angryShake(1).0,0,accuracy:0.001)
        XCTAssertEqual(angryShake(0.26).0,2,accuracy:0.001)
        XCTAssertEqual(angryShake(0.26).1,1.6,accuracy:0.001)
        XCTAssertEqual(angryShake(17.26).1,1.6,accuracy:0.001)
    }
}
