import { expect, formatUrl } from "@connext/nxtp-utils";
import axios from "axios";
import { SinonStub, stub } from "sinon";

import { SequencerResponseInvalid } from "../../../src/lib/errors";
import { sendBid } from "../../../src/lib/helpers/auctions";
import { mock, stubContext, stubHelpers } from "../../mock";

const { requestContext } = mock.loggingContext("BID-TEST");

describe("Helpers:Auctions", () => {
  let mockContext: any;

  before(() => {
    mockContext = stubContext();
  });

  describe("#sendBid", () => {
    const mockSequencerUrl = "http://mockUrl:1234";
    let axiosPostStub: SinonStub;
    const mockBid = mock.entity.bid();
    beforeEach(() => {
      mockContext.config.sequencerUrl = mockSequencerUrl;
      axiosPostStub = stub(axios, "post").resolves({ data: "ok" });
    });

    afterEach(() => {
      axiosPostStub.restore();
    });

    it("happy", async () => {
      const result = await sendBid(mockBid, requestContext);
      expect(axiosPostStub).to.have.been.calledOnceWithExactly(formatUrl(mockSequencerUrl, "auctions"), mockBid);
      expect(result).to.equal("ok");
    });

    it("throws SequencerResponseInvalid if no response", async () => {
      axiosPostStub.resolves();
      await expect(sendBid(mockBid, requestContext)).to.be.rejectedWith(SequencerResponseInvalid);
    });

    it("throws SequencerResponseInvalid if no response.data", async () => {
      axiosPostStub.resolves({ data: undefined });
      await expect(sendBid(mockBid, requestContext)).to.be.rejectedWith(SequencerResponseInvalid);
    });
  });
});
