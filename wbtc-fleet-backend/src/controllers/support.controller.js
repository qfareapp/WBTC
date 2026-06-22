const ApiError = require("../utils/ApiError");
const { getSupportNode } = require("../services/passengerSupportFlow.service");

exports.getSupportMenu = async (req, res, next) => {
  try {
    const nodeId = req.params.nodeId || req.query.nodeId;
    const node = getSupportNode(nodeId);

    if (!node) {
      return next(new ApiError(404, "Support option not found"));
    }

    res.json({
      ok: true,
      node,
    });
  } catch (err) {
    next(err);
  }
};
