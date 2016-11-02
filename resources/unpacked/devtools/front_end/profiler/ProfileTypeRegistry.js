// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @unrestricted
 */
WebInspector.ProfileTypeRegistry = class {
  constructor() {
    this._profileTypes = [];

    this.cpuProfileType = new WebInspector.CPUProfileType();
    this._addProfileType(this.cpuProfileType);
    this.heapSnapshotProfileType = new WebInspector.HeapSnapshotProfileType();
    this._addProfileType(this.heapSnapshotProfileType);
    this.trackingHeapSnapshotProfileType = new WebInspector.TrackingHeapSnapshotProfileType();
    this._addProfileType(this.trackingHeapSnapshotProfileType);
    this.samplingHeapProfileType = new WebInspector.SamplingHeapProfileType();
    this._addProfileType(this.samplingHeapProfileType);
  }

  /**
   * @param {!WebInspector.ProfileType} profileType
   */
  _addProfileType(profileType) {
    this._profileTypes.push(profileType);
  }

  /**
   * @return {!Array.<!WebInspector.ProfileType>}
   */
  profileTypes() {
    return this._profileTypes;
  }
};

WebInspector.ProfileTypeRegistry.instance = new WebInspector.ProfileTypeRegistry();
