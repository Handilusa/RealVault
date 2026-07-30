// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title MockChainlinkAggregator
 * @notice Mock implementation of Chainlink AggregatorV3Interface for testing
 * @dev Provides controllable price feed data for testing oracle adapter validation logic
 */
contract MockChainlinkAggregator {
    uint8 private _decimals;
    string private _description;
    uint256 private _version;

    // Latest round data
    uint80 private _roundId;
    int256 private _answer;
    uint256 private _startedAt;
    uint256 private _updatedAt;
    uint80 private _answeredInRound;

    // Control flags for testing
    bool private _shouldRevert;

    event AnswerUpdated(
        int256 indexed current,
        uint256 indexed roundId,
        uint256 updatedAt
    );

    constructor(uint8 decimals_, string memory description_) {
        _decimals = decimals_;
        _description = description_;
        _version = 1;
        _shouldRevert = false;
    }

    function decimals() external view returns (uint8) {
        return _decimals;
    }

    function description() external view returns (string memory) {
        return _description;
    }

    function version() external view returns (uint256) {
        return _version;
    }

    function getRoundData(uint80 roundId_)
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        require(!_shouldRevert, "Mock: getRoundData reverted");
        return (roundId_, _answer, _startedAt, _updatedAt, _answeredInRound);
    }

    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        require(!_shouldRevert, "Mock: latestRoundData reverted");
        return (_roundId, _answer, _startedAt, _updatedAt, _answeredInRound);
    }

    // ========== Test Helper Functions ==========

    /**
     * @notice Updates the latest round data
     * @param roundId_ New round ID
     * @param answer_ New price answer
     * @param updatedAt_ Timestamp of update
     * @param answeredInRound_ Round ID when answer was computed
     */
    function updateRoundData(
        uint80 roundId_,
        int256 answer_,
        uint256 updatedAt_,
        uint80 answeredInRound_
    ) external {
        _roundId = roundId_;
        _answer = answer_;
        _startedAt = updatedAt_;
        _updatedAt = updatedAt_;
        _answeredInRound = answeredInRound_;

        emit AnswerUpdated(answer_, roundId_, updatedAt_);
    }

    /**
     * @notice Sets whether the feed should revert on queries
     * @param shouldRevert_ True to make queries revert
     */
    function setShouldRevert(bool shouldRevert_) external {
        _shouldRevert = shouldRevert_;
    }

    /**
     * @notice Updates the feed decimals (for testing decimal conversion)
     * @param decimals_ New decimals value
     */
    function setDecimals(uint8 decimals_) external {
        _decimals = decimals_;
    }
}
