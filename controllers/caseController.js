// controllers/caseController.js - NEW FILE for case management with activity logging
const { logActivity } = require("./activityController");

// Handle case - for police case management
const handleCase = async (req, res) => {
  try {
    const {
      caseTitle,
      caseType,
      priority,
      description,
      involvedParties,
      evidence,
    } = req.body;

    // Create case object (you'll need to define a Case model)
    const caseData = {
      id: `case_${Date.now()}`,
      title: caseTitle,
      type: caseType,
      priority,
      description,
      involvedParties: involvedParties || [],
      evidence: evidence || [],
      handledBy: req.user.policeId,
      status: "active",
      createdAt: new Date(),
    };

    // Log case handling activity
    await logActivity(
      req.user.policeId.toString(),
      "case_handled",
      "case",
      caseData.id,
      {
        caseTitle,
        caseType,
        priority,
        handledBy: req.user.name,
        involvedPartiesCount: involvedParties?.length || 0,
      },
      req
    );

    res.json({
      success: true,
      message: "Case handled successfully",
      case: caseData,
    });
  } catch (error) {
    console.error("Handle case error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to handle case",
    });
  }
};

// Update case
const updateCase = async (req, res) => {
  try {
    const { caseId } = req.params;
    const updateData = req.body;

    // Update case logic here

    // Log case update activity
    await logActivity(
      req.user.policeId.toString(),
      "case_updated",
      "case",
      caseId,
      {
        caseId,
        updatedFields: Object.keys(updateData),
        updatedBy: req.user.name,
      },
      req
    );

    res.json({
      success: true,
      message: "Case updated successfully",
    });
  } catch (error) {
    console.error("Update case error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update case",
    });
  }
};

// Close case
const closeCase = async (req, res) => {
  try {
    const { caseId } = req.params;
    const { closureReason, resolution } = req.body;

    // Close case logic here

    // Log case closure activity
    await logActivity(
      req.user.policeId.toString(),
      "case_closed",
      "case",
      caseId,
      {
        caseId,
        closureReason,
        resolution,
        closedBy: req.user.name,
        closedAt: new Date(),
      },
      req
    );

    res.json({
      success: true,
      message: "Case closed successfully",
    });
  } catch (error) {
    console.error("Close case error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to close case",
    });
  }
};

module.exports = {
  handleCase,
  updateCase,
  closeCase,
};
