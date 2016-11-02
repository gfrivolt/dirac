/*
 * Copyright (C) 2009, 2010 Google Inc. All rights reserved.
 * Copyright (C) 2009 Joseph Pecoraro
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *     * Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above
 * copyright notice, this list of conditions and the following disclaimer
 * in the documentation and/or other materials provided with the
 * distribution.
 *     * Neither the name of Google Inc. nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/**
 * @unrestricted
 */
WebInspector.DOMNode = class extends WebInspector.SDKObject {
  /**
   * @param {!WebInspector.DOMModel} domModel
   */
  constructor(domModel) {
    super(domModel.target());
    this._domModel = domModel;
  }

  /**
   * @param {!WebInspector.DOMModel} domModel
   * @param {?WebInspector.DOMDocument} doc
   * @param {boolean} isInShadowTree
   * @param {!DOMAgent.Node} payload
   * @return {!WebInspector.DOMNode}
   */
  static create(domModel, doc, isInShadowTree, payload) {
    var node = new WebInspector.DOMNode(domModel);
    node._init(doc, isInShadowTree, payload);
    return node;
  }

  /**
   * @param {?WebInspector.DOMDocument} doc
   * @param {boolean} isInShadowTree
   * @param {!DOMAgent.Node} payload
   */
  _init(doc, isInShadowTree, payload) {
    this._agent = this._domModel._agent;
    this.ownerDocument = doc;
    this._isInShadowTree = isInShadowTree;

    this.id = payload.nodeId;
    this._domModel._idToDOMNode[this.id] = this;
    this._nodeType = payload.nodeType;
    this._nodeName = payload.nodeName;
    this._localName = payload.localName;
    this._nodeValue = payload.nodeValue;
    this._pseudoType = payload.pseudoType;
    this._shadowRootType = payload.shadowRootType;
    this._frameOwnerFrameId = payload.frameId || null;
    this._xmlVersion = payload.xmlVersion;

    this._shadowRoots = [];

    this._attributes = [];
    this._attributesMap = {};
    if (payload.attributes)
      this._setAttributesPayload(payload.attributes);

    /** @type {!Map<string, ?>} */
    this._markers = new Map();
    this._subtreeMarkerCount = 0;

    this._childNodeCount = payload.childNodeCount || 0;
    this._children = null;

    this.nextSibling = null;
    this.previousSibling = null;
    this.firstChild = null;
    this.lastChild = null;
    this.parentNode = null;

    if (payload.shadowRoots) {
      for (var i = 0; i < payload.shadowRoots.length; ++i) {
        var root = payload.shadowRoots[i];
        var node = WebInspector.DOMNode.create(this._domModel, this.ownerDocument, true, root);
        this._shadowRoots.push(node);
        node.parentNode = this;
      }
    }

    if (payload.templateContent) {
      this._templateContent =
          WebInspector.DOMNode.create(this._domModel, this.ownerDocument, true, payload.templateContent);
      this._templateContent.parentNode = this;
    }

    if (payload.importedDocument) {
      this._importedDocument =
          WebInspector.DOMNode.create(this._domModel, this.ownerDocument, true, payload.importedDocument);
      this._importedDocument.parentNode = this;
    }

    if (payload.distributedNodes)
      this._setDistributedNodePayloads(payload.distributedNodes);

    if (payload.children)
      this._setChildrenPayload(payload.children);

    this._setPseudoElements(payload.pseudoElements);

    if (payload.contentDocument) {
      this._contentDocument = new WebInspector.DOMDocument(this._domModel, payload.contentDocument);
      this._children = [this._contentDocument];
      this._renumber();
    }

    if (this._nodeType === Node.ELEMENT_NODE) {
      // HTML and BODY from internal iframes should not overwrite top-level ones.
      if (this.ownerDocument && !this.ownerDocument.documentElement && this._nodeName === 'HTML')
        this.ownerDocument.documentElement = this;
      if (this.ownerDocument && !this.ownerDocument.body && this._nodeName === 'BODY')
        this.ownerDocument.body = this;
    } else if (this._nodeType === Node.DOCUMENT_TYPE_NODE) {
      this.publicId = payload.publicId;
      this.systemId = payload.systemId;
      this.internalSubset = payload.internalSubset;
    } else if (this._nodeType === Node.ATTRIBUTE_NODE) {
      this.name = payload.name;
      this.value = payload.value;
    }
  }

  /**
   * @return {!WebInspector.DOMModel}
   */
  domModel() {
    return this._domModel;
  }

  /**
   * @return {?Array.<!WebInspector.DOMNode>}
   */
  children() {
    return this._children ? this._children.slice() : null;
  }

  /**
   * @return {boolean}
   */
  hasAttributes() {
    return this._attributes.length > 0;
  }

  /**
   * @return {number}
   */
  childNodeCount() {
    return this._childNodeCount;
  }

  /**
   * @return {boolean}
   */
  hasShadowRoots() {
    return !!this._shadowRoots.length;
  }

  /**
   * @return {!Array.<!WebInspector.DOMNode>}
   */
  shadowRoots() {
    return this._shadowRoots.slice();
  }

  /**
   * @return {?WebInspector.DOMNode}
   */
  templateContent() {
    return this._templateContent || null;
  }

  /**
   * @return {?WebInspector.DOMNode}
   */
  importedDocument() {
    return this._importedDocument || null;
  }

  /**
   * @return {number}
   */
  nodeType() {
    return this._nodeType;
  }

  /**
   * @return {string}
   */
  nodeName() {
    return this._nodeName;
  }

  /**
   * @return {string|undefined}
   */
  pseudoType() {
    return this._pseudoType;
  }

  /**
   * @return {boolean}
   */
  hasPseudoElements() {
    return this._pseudoElements.size > 0;
  }

  /**
   * @return {!Map<string, !WebInspector.DOMNode>}
   */
  pseudoElements() {
    return this._pseudoElements;
  }

  /**
   * @return {?WebInspector.DOMNode}
   */
  beforePseudoElement() {
    if (!this._pseudoElements)
      return null;
    return this._pseudoElements.get(WebInspector.DOMNode.PseudoElementNames.Before);
  }

  /**
   * @return {?WebInspector.DOMNode}
   */
  afterPseudoElement() {
    if (!this._pseudoElements)
      return null;
    return this._pseudoElements.get(WebInspector.DOMNode.PseudoElementNames.After);
  }

  /**
   * @return {boolean}
   */
  isInsertionPoint() {
    return !this.isXMLNode() &&
        (this._nodeName === 'SHADOW' || this._nodeName === 'CONTENT' || this._nodeName === 'SLOT');
  }

  /**
   * @return {!Array.<!WebInspector.DOMNodeShortcut>}
   */
  distributedNodes() {
    return this._distributedNodes || [];
  }

  /**
   * @return {boolean}
   */
  isInShadowTree() {
    return this._isInShadowTree;
  }

  /**
   * @return {?WebInspector.DOMNode}
   */
  ancestorShadowHost() {
    var ancestorShadowRoot = this.ancestorShadowRoot();
    return ancestorShadowRoot ? ancestorShadowRoot.parentNode : null;
  }

  /**
   * @return {?WebInspector.DOMNode}
   */
  ancestorShadowRoot() {
    if (!this._isInShadowTree)
      return null;

    var current = this;
    while (current && !current.isShadowRoot())
      current = current.parentNode;
    return current;
  }

  /**
   * @return {?WebInspector.DOMNode}
   */
  ancestorUserAgentShadowRoot() {
    var ancestorShadowRoot = this.ancestorShadowRoot();
    if (!ancestorShadowRoot)
      return null;
    return ancestorShadowRoot.shadowRootType() === WebInspector.DOMNode.ShadowRootTypes.UserAgent ? ancestorShadowRoot :
                                                                                                    null;
  }

  /**
   * @return {boolean}
   */
  isShadowRoot() {
    return !!this._shadowRootType;
  }

  /**
   * @return {?string}
   */
  shadowRootType() {
    return this._shadowRootType || null;
  }

  /**
   * @return {string}
   */
  nodeNameInCorrectCase() {
    var shadowRootType = this.shadowRootType();
    if (shadowRootType)
      return '#shadow-root (' + shadowRootType + ')';

    // If there is no local name, it's case sensitive
    if (!this.localName())
      return this.nodeName();

    // If the names are different lengths, there is a prefix and it's case sensitive
    if (this.localName().length !== this.nodeName().length)
      return this.nodeName();

    // Return the localname, which will be case insensitive if its an html node
    return this.localName();
  }

  /**
   * @param {string} name
   * @param {function(?Protocol.Error, number)=} callback
   */
  setNodeName(name, callback) {
    this._agent.setNodeName(this.id, name, this._domModel._markRevision(this, callback));
  }

  /**
   * @return {string}
   */
  localName() {
    return this._localName;
  }

  /**
   * @return {string}
   */
  nodeValue() {
    return this._nodeValue;
  }

  /**
   * @param {string} value
   * @param {function(?Protocol.Error)=} callback
   */
  setNodeValue(value, callback) {
    this._agent.setNodeValue(this.id, value, this._domModel._markRevision(this, callback));
  }

  /**
   * @param {string} name
   * @return {string}
   */
  getAttribute(name) {
    var attr = this._attributesMap[name];
    return attr ? attr.value : undefined;
  }

  /**
   * @param {string} name
   * @param {string} text
   * @param {function(?Protocol.Error)=} callback
   */
  setAttribute(name, text, callback) {
    this._agent.setAttributesAsText(this.id, text, name, this._domModel._markRevision(this, callback));
  }

  /**
   * @param {string} name
   * @param {string} value
   * @param {function(?Protocol.Error)=} callback
   */
  setAttributeValue(name, value, callback) {
    this._agent.setAttributeValue(this.id, name, value, this._domModel._markRevision(this, callback));
  }

  /**
   * @return {!Array<!WebInspector.DOMNode.Attribute>}
   */
  attributes() {
    return this._attributes;
  }

  /**
   * @param {string} name
   * @param {function(?Protocol.Error)=} callback
   */
  removeAttribute(name, callback) {
    /**
     * @param {?Protocol.Error} error
     * @this {WebInspector.DOMNode}
     */
    function mycallback(error) {
      if (!error) {
        delete this._attributesMap[name];
        for (var i = 0; i < this._attributes.length; ++i) {
          if (this._attributes[i].name === name) {
            this._attributes.splice(i, 1);
            break;
          }
        }
      }

      this._domModel._markRevision(this, callback)(error);
    }
    this._agent.removeAttribute(this.id, name, mycallback.bind(this));
  }

  /**
   * @param {function(?Array.<!WebInspector.DOMNode>)=} callback
   */
  getChildNodes(callback) {
    if (this._children) {
      if (callback)
        callback(this.children());
      return;
    }

    /**
     * @this {WebInspector.DOMNode}
     * @param {?Protocol.Error} error
     */
    function mycallback(error) {
      if (callback)
        callback(error ? null : this.children());
    }

    this._agent.requestChildNodes(this.id, undefined, mycallback.bind(this));
  }

  /**
   * @param {number} depth
   * @param {function(?Array.<!WebInspector.DOMNode>)=} callback
   */
  getSubtree(depth, callback) {
    /**
     * @this {WebInspector.DOMNode}
     * @param {?Protocol.Error} error
     */
    function mycallback(error) {
      if (callback)
        callback(error ? null : this._children);
    }

    this._agent.requestChildNodes(this.id, depth, mycallback.bind(this));
  }

  /**
   * @param {function(?Protocol.Error, string)=} callback
   */
  getOuterHTML(callback) {
    this._agent.getOuterHTML(this.id, callback);
  }

  /**
   * @param {string} html
   * @param {function(?Protocol.Error)=} callback
   */
  setOuterHTML(html, callback) {
    this._agent.setOuterHTML(this.id, html, this._domModel._markRevision(this, callback));
  }

  /**
   * @param {function(?Protocol.Error, !DOMAgent.NodeId=)=} callback
   */
  removeNode(callback) {
    this._agent.removeNode(this.id, this._domModel._markRevision(this, callback));
  }

  /**
   * @param {function(?string)=} callback
   */
  copyNode(callback) {
    function copy(error, text) {
      if (!error)
        InspectorFrontendHost.copyText(text);
      if (callback)
        callback(error ? null : text);
    }
    this._agent.getOuterHTML(this.id, copy);
  }

  /**
   * @return {string}
   */
  path() {
    /**
     * @param {?WebInspector.DOMNode} node
     */
    function canPush(node) {
      return node && ('index' in node || (node.isShadowRoot() && node.parentNode)) && node._nodeName.length;
    }

    var path = [];
    var node = this;
    while (canPush(node)) {
      var index = typeof node.index === 'number' ?
          node.index :
          (node.shadowRootType() === WebInspector.DOMNode.ShadowRootTypes.UserAgent ? 'u' : 'a');
      path.push([index, node._nodeName]);
      node = node.parentNode;
    }
    path.reverse();
    return path.join(',');
  }

  /**
   * @param {!WebInspector.DOMNode} node
   * @return {boolean}
   */
  isAncestor(node) {
    if (!node)
      return false;

    var currentNode = node.parentNode;
    while (currentNode) {
      if (this === currentNode)
        return true;
      currentNode = currentNode.parentNode;
    }
    return false;
  }

  /**
   * @param {!WebInspector.DOMNode} descendant
   * @return {boolean}
   */
  isDescendant(descendant) {
    return descendant !== null && descendant.isAncestor(this);
  }

  /**
   * @return {?PageAgent.FrameId}
   */
  frameId() {
    var node = this.parentNode || this;
    while (!node._frameOwnerFrameId && node.parentNode)
      node = node.parentNode;
    return node._frameOwnerFrameId;
  }

  /**
   * @param {!Array.<string>} attrs
   * @return {boolean}
   */
  _setAttributesPayload(attrs) {
    var attributesChanged = !this._attributes || attrs.length !== this._attributes.length * 2;
    var oldAttributesMap = this._attributesMap || {};

    this._attributes = [];
    this._attributesMap = {};

    for (var i = 0; i < attrs.length; i += 2) {
      var name = attrs[i];
      var value = attrs[i + 1];
      this._addAttribute(name, value);

      if (attributesChanged)
        continue;

      if (!oldAttributesMap[name] || oldAttributesMap[name].value !== value)
        attributesChanged = true;
    }
    return attributesChanged;
  }

  /**
   * @param {!WebInspector.DOMNode} prev
   * @param {!DOMAgent.Node} payload
   * @return {!WebInspector.DOMNode}
   */
  _insertChild(prev, payload) {
    var node = WebInspector.DOMNode.create(this._domModel, this.ownerDocument, this._isInShadowTree, payload);
    this._children.splice(this._children.indexOf(prev) + 1, 0, node);
    this._renumber();
    return node;
  }

  /**
   * @param {!WebInspector.DOMNode} node
   */
  _removeChild(node) {
    if (node.pseudoType()) {
      this._pseudoElements.delete(node.pseudoType());
    } else {
      var shadowRootIndex = this._shadowRoots.indexOf(node);
      if (shadowRootIndex !== -1) {
        this._shadowRoots.splice(shadowRootIndex, 1);
      } else {
        console.assert(this._children.indexOf(node) !== -1);
        this._children.splice(this._children.indexOf(node), 1);
      }
    }
    node.parentNode = null;
    this._subtreeMarkerCount -= node._subtreeMarkerCount;
    if (node._subtreeMarkerCount)
      this._domModel.dispatchEventToListeners(WebInspector.DOMModel.Events.MarkersChanged, this);
    this._renumber();
  }

  /**
   * @param {!Array.<!DOMAgent.Node>} payloads
   */
  _setChildrenPayload(payloads) {
    // We set children in the constructor.
    if (this._contentDocument)
      return;

    this._children = [];
    for (var i = 0; i < payloads.length; ++i) {
      var payload = payloads[i];
      var node = WebInspector.DOMNode.create(this._domModel, this.ownerDocument, this._isInShadowTree, payload);
      this._children.push(node);
    }
    this._renumber();
  }

  /**
   * @param {!Array.<!DOMAgent.Node>|undefined} payloads
   */
  _setPseudoElements(payloads) {
    this._pseudoElements = new Map();
    if (!payloads)
      return;

    for (var i = 0; i < payloads.length; ++i) {
      var node = WebInspector.DOMNode.create(this._domModel, this.ownerDocument, this._isInShadowTree, payloads[i]);
      node.parentNode = this;
      this._pseudoElements.set(node.pseudoType(), node);
    }
  }

  /**
   * @param {!Array.<!DOMAgent.BackendNode>} payloads
   */
  _setDistributedNodePayloads(payloads) {
    this._distributedNodes = [];
    for (var payload of payloads)
      this._distributedNodes.push(new WebInspector.DOMNodeShortcut(
          this._domModel.target(), payload.backendNodeId, payload.nodeType, payload.nodeName));
  }

  _renumber() {
    this._childNodeCount = this._children.length;
    if (this._childNodeCount === 0) {
      this.firstChild = null;
      this.lastChild = null;
      return;
    }
    this.firstChild = this._children[0];
    this.lastChild = this._children[this._childNodeCount - 1];
    for (var i = 0; i < this._childNodeCount; ++i) {
      var child = this._children[i];
      child.index = i;
      child.nextSibling = i + 1 < this._childNodeCount ? this._children[i + 1] : null;
      child.previousSibling = i - 1 >= 0 ? this._children[i - 1] : null;
      child.parentNode = this;
    }
  }

  /**
   * @param {string} name
   * @param {string} value
   */
  _addAttribute(name, value) {
    var attr = {name: name, value: value, _node: this};
    this._attributesMap[name] = attr;
    this._attributes.push(attr);
  }

  /**
   * @param {string} name
   * @param {string} value
   */
  _setAttribute(name, value) {
    var attr = this._attributesMap[name];
    if (attr)
      attr.value = value;
    else
      this._addAttribute(name, value);
  }

  /**
   * @param {string} name
   */
  _removeAttribute(name) {
    var attr = this._attributesMap[name];
    if (attr) {
      this._attributes.remove(attr);
      delete this._attributesMap[name];
    }
  }

  /**
   * @param {!WebInspector.DOMNode} targetNode
   * @param {?WebInspector.DOMNode} anchorNode
   * @param {function(?Protocol.Error, !DOMAgent.NodeId=)=} callback
   */
  copyTo(targetNode, anchorNode, callback) {
    this._agent.copyTo(
        this.id, targetNode.id, anchorNode ? anchorNode.id : undefined, this._domModel._markRevision(this, callback));
  }

  /**
   * @param {!WebInspector.DOMNode} targetNode
   * @param {?WebInspector.DOMNode} anchorNode
   * @param {function(?Protocol.Error, !DOMAgent.NodeId=)=} callback
   */
  moveTo(targetNode, anchorNode, callback) {
    this._agent.moveTo(
        this.id, targetNode.id, anchorNode ? anchorNode.id : undefined, this._domModel._markRevision(this, callback));
  }

  /**
   * @return {boolean}
   */
  isXMLNode() {
    return !!this._xmlVersion;
  }

  /**
   * @param {string} name
   * @param {?*} value
   */
  setMarker(name, value) {
    if (value === null) {
      if (!this._markers.has(name))
        return;

      this._markers.delete(name);
      for (var node = this; node; node = node.parentNode)
        --node._subtreeMarkerCount;
      for (var node = this; node; node = node.parentNode)
        this._domModel.dispatchEventToListeners(WebInspector.DOMModel.Events.MarkersChanged, node);
      return;
    }

    if (this.parentNode && !this._markers.has(name)) {
      for (var node = this; node; node = node.parentNode)
        ++node._subtreeMarkerCount;
    }
    this._markers.set(name, value);
    for (var node = this; node; node = node.parentNode)
      this._domModel.dispatchEventToListeners(WebInspector.DOMModel.Events.MarkersChanged, node);
  }

  /**
   * @param {string} name
   * @return {?T}
   * @template T
   */
  marker(name) {
    return this._markers.get(name) || null;
  }

  /**
   * @param {function(!WebInspector.DOMNode, string)} visitor
   */
  traverseMarkers(visitor) {
    /**
     * @param {!WebInspector.DOMNode} node
     */
    function traverse(node) {
      if (!node._subtreeMarkerCount)
        return;
      for (var marker of node._markers.keys())
        visitor(node, marker);
      if (!node._children)
        return;
      for (var child of node._children)
        traverse(child);
    }
    traverse(this);
  }

  /**
   * @param {string} url
   * @return {?string}
   */
  resolveURL(url) {
    if (!url)
      return url;
    for (var frameOwnerCandidate = this; frameOwnerCandidate; frameOwnerCandidate = frameOwnerCandidate.parentNode) {
      if (frameOwnerCandidate.baseURL)
        return WebInspector.ParsedURL.completeURL(frameOwnerCandidate.baseURL, url);
    }
    return null;
  }

  /**
   * @param {string=} mode
   * @param {!RuntimeAgent.RemoteObjectId=} objectId
   */
  highlight(mode, objectId) {
    this._domModel.highlightDOMNode(this.id, mode, undefined, objectId);
  }

  highlightForTwoSeconds() {
    this._domModel.highlightDOMNodeForTwoSeconds(this.id);
  }

  /**
   * @param {string=} objectGroup
   * @param {function(?WebInspector.RemoteObject)=} callback
   */
  resolveToObject(objectGroup, callback) {
    this._agent.resolveNode(this.id, objectGroup, mycallback.bind(this));

    /**
     * @param {?Protocol.Error} error
     * @param {!RuntimeAgent.RemoteObject} object
     * @this {WebInspector.DOMNode}
     */
    function mycallback(error, object) {
      if (!callback)
        return;

      if (error || !object)
        callback(null);
      else
        callback(this.target().runtimeModel.createRemoteObject(object));
    }
  }

  /**
   * @param {string=} objectGroup
   * @return {!Promise<!WebInspector.RemoteObject>}
   */
  resolveToObjectPromise(objectGroup) {
    return new Promise(resolveToObject.bind(this));
    /**
     * @param {function(?)} fulfill
     * @param {function(*)} reject
     * @this {WebInspector.DOMNode}
     */
    function resolveToObject(fulfill, reject) {
      this.resolveToObject(objectGroup, mycallback);
      function mycallback(object) {
        if (object)
          fulfill(object);
        else
          reject(null);
      }
    }
  }

  /**
   * @param {function(?DOMAgent.BoxModel)} callback
   */
  boxModel(callback) {
    this._agent.getBoxModel(this.id, this._domModel._wrapClientCallback(callback));
  }

  setAsInspectedNode() {
    var node = this;
    while (true) {
      var ancestor = node.ancestorUserAgentShadowRoot();
      if (!ancestor)
        break;
      ancestor = node.ancestorShadowHost();
      if (!ancestor)
        break;
      // User agent shadow root, keep climbing up.
      node = ancestor;
    }
    this._agent.setInspectedNode(node.id);
  }

  /**
   *  @return {?WebInspector.DOMNode}
   */
  enclosingElementOrSelf() {
    var node = this;
    if (node && node.nodeType() === Node.TEXT_NODE && node.parentNode)
      node = node.parentNode;

    if (node && node.nodeType() !== Node.ELEMENT_NODE)
      node = null;
    return node;
  }
};

/**
 * @enum {string}
 */
WebInspector.DOMNode.PseudoElementNames = {
  Before: 'before',
  After: 'after'
};

/**
 * @enum {string}
 */
WebInspector.DOMNode.ShadowRootTypes = {
  UserAgent: 'user-agent',
  Open: 'open',
  Closed: 'closed'
};

/** @typedef {{name: string, value: string, _node: WebInspector.DOMNode}} */
WebInspector.DOMNode.Attribute;

/**
 * @unrestricted
 */
WebInspector.DeferredDOMNode = class {
  /**
   * @param {!WebInspector.Target} target
   * @param {number} backendNodeId
   */
  constructor(target, backendNodeId) {
    this._domModel = WebInspector.DOMModel.fromTarget(target);
    this._backendNodeId = backendNodeId;
  }

  /**
   * @param {function(?WebInspector.DOMNode)} callback
   */
  resolve(callback) {
    if (!this._domModel) {
      callback(null);
      return;
    }

    this._domModel.pushNodesByBackendIdsToFrontend(new Set([this._backendNodeId]), onGotNode.bind(this));

    /**
     * @param {?Map<number, ?WebInspector.DOMNode>} nodeIds
     * @this {WebInspector.DeferredDOMNode}
     */
    function onGotNode(nodeIds) {
      callback(nodeIds && (nodeIds.get(this._backendNodeId) || null));
    }
  }

  /**
   * @return {!Promise.<!WebInspector.DOMNode>}
   */
  resolvePromise() {
    /**
     * @param {function(?)} fulfill
     * @param {function(*)} reject
     * @this {WebInspector.DeferredDOMNode}
     */
    function resolveNode(fulfill, reject) {
      /**
       * @param {?WebInspector.DOMNode} node
       */
      function mycallback(node) {
        fulfill(node);
      }
      this.resolve(mycallback);
    }
    return new Promise(resolveNode.bind(this));
  }

  /**
   * @return {number}
   */
  backendNodeId() {
    return this._backendNodeId;
  }

  highlight() {
    if (this._domModel)
      this._domModel.highlightDOMNode(undefined, undefined, this._backendNodeId);
  }
};

/**
 * @unrestricted
 */
WebInspector.DOMNodeShortcut = class {
  /**
   * @param {!WebInspector.Target} target
   * @param {number} backendNodeId
   * @param {number} nodeType
   * @param {string} nodeName
   */
  constructor(target, backendNodeId, nodeType, nodeName) {
    this.nodeType = nodeType;
    this.nodeName = nodeName;
    this.deferredNode = new WebInspector.DeferredDOMNode(target, backendNodeId);
  }
};

/**
 * @unrestricted
 */
WebInspector.DOMDocument = class extends WebInspector.DOMNode {
  /**
   * @param {!WebInspector.DOMModel} domModel
   * @param {!DOMAgent.Node} payload
   */
  constructor(domModel, payload) {
    super(domModel);
    this._init(this, false, payload);
    this.documentURL = payload.documentURL || '';
    this.baseURL = payload.baseURL || '';
    this._listeners = {};
  }
};

/**
 * @unrestricted
 */
WebInspector.DOMModel = class extends WebInspector.SDKModel {
  /**
   * @param {!WebInspector.Target} target
   */
  constructor(target) {
    super(WebInspector.DOMModel, target);

    this._agent = target.domAgent();

    /** @type {!Object.<number, !WebInspector.DOMNode>} */
    this._idToDOMNode = {};
    /** @type {?WebInspector.DOMDocument} */
    this._document = null;
    /** @type {!Object.<number, boolean>} */
    this._attributeLoadNodeIds = {};
    target.registerDOMDispatcher(new WebInspector.DOMDispatcher(this));

    this._inspectModeEnabled = false;

    this._defaultHighlighter = new WebInspector.DefaultDOMNodeHighlighter(this._agent);
    this._highlighter = this._defaultHighlighter;

    this._agent.enable();
  }

  /**
   * @param {!WebInspector.RemoteObject} object
   */
  static highlightObjectAsDOMNode(object) {
    var domModel = WebInspector.DOMModel.fromTarget(object.target());
    if (domModel)
      domModel.highlightDOMNode(undefined, undefined, undefined, object.objectId);
  }

  /**
   * @return {!Array<!WebInspector.DOMModel>}
   */
  static instances() {
    var result = [];
    for (var target of WebInspector.targetManager.targets()) {
      var domModel = WebInspector.DOMModel.fromTarget(target);
      if (domModel)
        result.push(domModel);
    }
    return result;
  }

  static hideDOMNodeHighlight() {
    for (var domModel of WebInspector.DOMModel.instances())
      domModel.highlightDOMNode(0);
  }

  static muteHighlight() {
    WebInspector.DOMModel.hideDOMNodeHighlight();
    WebInspector.DOMModel._highlightDisabled = true;
  }

  static unmuteHighlight() {
    WebInspector.DOMModel._highlightDisabled = false;
  }

  static cancelSearch() {
    for (var domModel of WebInspector.DOMModel.instances())
      domModel._cancelSearch();
  }

  /**
   * @param {!WebInspector.Target} target
   * @return {?WebInspector.DOMModel}
   */
  static fromTarget(target) {
    return /** @type {?WebInspector.DOMModel} */ (target.model(WebInspector.DOMModel));
  }

  /**
   * @param {!WebInspector.DOMNode} node
   */
  _scheduleMutationEvent(node) {
    if (!this.hasEventListeners(WebInspector.DOMModel.Events.DOMMutated))
      return;

    this._lastMutationId = (this._lastMutationId || 0) + 1;
    Promise.resolve().then(callObserve.bind(this, node, this._lastMutationId));

    /**
     * @this {WebInspector.DOMModel}
     * @param {!WebInspector.DOMNode} node
     * @param {number} mutationId
     */
    function callObserve(node, mutationId) {
      if (!this.hasEventListeners(WebInspector.DOMModel.Events.DOMMutated) || this._lastMutationId !== mutationId)
        return;

      this.dispatchEventToListeners(WebInspector.DOMModel.Events.DOMMutated, node);
    }
  }

  /**
   * @param {function(!WebInspector.DOMDocument)=} callback
   */
  requestDocument(callback) {
    if (this._document) {
      if (callback)
        callback(this._document);
      return;
    }

    if (this._pendingDocumentRequestCallbacks) {
      this._pendingDocumentRequestCallbacks.push(callback);
      return;
    }

    this._pendingDocumentRequestCallbacks = [callback];

    /**
     * @this {WebInspector.DOMModel}
     * @param {?Protocol.Error} error
     * @param {!DOMAgent.Node} root
     */
    function onDocumentAvailable(error, root) {
      if (!error)
        this._setDocument(root);

      for (var i = 0; i < this._pendingDocumentRequestCallbacks.length; ++i) {
        var callback = this._pendingDocumentRequestCallbacks[i];
        if (callback)
          callback(this._document);
      }
      delete this._pendingDocumentRequestCallbacks;
    }

    this._agent.getDocument(undefined, undefined, onDocumentAvailable.bind(this));
  }

  /**
   * @return {?WebInspector.DOMDocument}
   */
  existingDocument() {
    return this._document;
  }

  /**
   * @param {!RuntimeAgent.RemoteObjectId} objectId
   * @param {function(?WebInspector.DOMNode)=} callback
   */
  pushNodeToFrontend(objectId, callback) {
    /**
     * @param {?DOMAgent.NodeId} nodeId
     * @this {!WebInspector.DOMModel}
     */
    function mycallback(nodeId) {
      callback(nodeId ? this.nodeForId(nodeId) : null);
    }
    this._dispatchWhenDocumentAvailable(this._agent.requestNode.bind(this._agent, objectId), mycallback.bind(this));
  }

  /**
   * @param {string} path
   * @param {function(?number)=} callback
   */
  pushNodeByPathToFrontend(path, callback) {
    this._dispatchWhenDocumentAvailable(this._agent.pushNodeByPathToFrontend.bind(this._agent, path), callback);
  }

  /**
   * @param {!Set<number>} backendNodeIds
   * @param {function(?Map<number, ?WebInspector.DOMNode>)} callback
   */
  pushNodesByBackendIdsToFrontend(backendNodeIds, callback) {
    var backendNodeIdsArray = backendNodeIds.valuesArray();
    /**
     * @param {?Array<!DOMAgent.NodeId>} nodeIds
     * @this {!WebInspector.DOMModel}
     */
    function mycallback(nodeIds) {
      if (!nodeIds) {
        callback(null);
        return;
      }
      /** @type {!Map<number, ?WebInspector.DOMNode>} */
      var map = new Map();
      for (var i = 0; i < nodeIds.length; ++i) {
        if (nodeIds[i])
          map.set(backendNodeIdsArray[i], this.nodeForId(nodeIds[i]));
      }
      callback(map);
    }
    this._dispatchWhenDocumentAvailable(
        this._agent.pushNodesByBackendIdsToFrontend.bind(this._agent, backendNodeIdsArray), mycallback.bind(this));
  }

  /**
   * @param {function(!T)=} callback
   * @return {function(?Protocol.Error, !T=)|undefined}
   * @template T
   */
  _wrapClientCallback(callback) {
    if (!callback)
      return;
    /**
     * @param {?Protocol.Error} error
     * @param {!T=} result
     * @template T
     */
    var wrapper = function(error, result) {
      // Caller is responsible for handling the actual error.
      callback(error ? null : result);
    };
    return wrapper;
  }

  /**
   * @param {function(function(?Protocol.Error, !T=)=)} func
   * @param {function(!T)=} callback
   * @template T
   */
  _dispatchWhenDocumentAvailable(func, callback) {
    var callbackWrapper = this._wrapClientCallback(callback);

    /**
     * @this {WebInspector.DOMModel}
     */
    function onDocumentAvailable() {
      if (this._document)
        func(callbackWrapper);
      else {
        if (callbackWrapper)
          callbackWrapper('No document');
      }
    }
    this.requestDocument(onDocumentAvailable.bind(this));
  }

  /**
   * @param {!DOMAgent.NodeId} nodeId
   * @param {string} name
   * @param {string} value
   */
  _attributeModified(nodeId, name, value) {
    var node = this._idToDOMNode[nodeId];
    if (!node)
      return;

    node._setAttribute(name, value);
    this.dispatchEventToListeners(WebInspector.DOMModel.Events.AttrModified, {node: node, name: name});
    this._scheduleMutationEvent(node);
  }

  /**
   * @param {!DOMAgent.NodeId} nodeId
   * @param {string} name
   */
  _attributeRemoved(nodeId, name) {
    var node = this._idToDOMNode[nodeId];
    if (!node)
      return;
    node._removeAttribute(name);
    this.dispatchEventToListeners(WebInspector.DOMModel.Events.AttrRemoved, {node: node, name: name});
    this._scheduleMutationEvent(node);
  }

  /**
   * @param {!Array.<!DOMAgent.NodeId>} nodeIds
   */
  _inlineStyleInvalidated(nodeIds) {
    for (var i = 0; i < nodeIds.length; ++i)
      this._attributeLoadNodeIds[nodeIds[i]] = true;
    if ('_loadNodeAttributesTimeout' in this)
      return;
    this._loadNodeAttributesTimeout = setTimeout(this._loadNodeAttributes.bind(this), 20);
  }

  _loadNodeAttributes() {
    /**
     * @this {WebInspector.DOMModel}
     * @param {!DOMAgent.NodeId} nodeId
     * @param {?Protocol.Error} error
     * @param {!Array.<string>} attributes
     */
    function callback(nodeId, error, attributes) {
      if (error) {
        // We are calling _loadNodeAttributes asynchronously, it is ok if node is not found.
        return;
      }
      var node = this._idToDOMNode[nodeId];
      if (node) {
        if (node._setAttributesPayload(attributes)) {
          this.dispatchEventToListeners(WebInspector.DOMModel.Events.AttrModified, {node: node, name: 'style'});
          this._scheduleMutationEvent(node);
        }
      }
    }

    delete this._loadNodeAttributesTimeout;

    for (var nodeId in this._attributeLoadNodeIds) {
      var nodeIdAsNumber = parseInt(nodeId, 10);
      this._agent.getAttributes(nodeIdAsNumber, callback.bind(this, nodeIdAsNumber));
    }
    this._attributeLoadNodeIds = {};
  }

  /**
   * @param {!DOMAgent.NodeId} nodeId
   * @param {string} newValue
   */
  _characterDataModified(nodeId, newValue) {
    var node = this._idToDOMNode[nodeId];
    node._nodeValue = newValue;
    this.dispatchEventToListeners(WebInspector.DOMModel.Events.CharacterDataModified, node);
    this._scheduleMutationEvent(node);
  }

  /**
   * @param {!DOMAgent.NodeId} nodeId
   * @return {?WebInspector.DOMNode}
   */
  nodeForId(nodeId) {
    return this._idToDOMNode[nodeId] || null;
  }

  _documentUpdated() {
    this._setDocument(null);
  }

  /**
   * @param {?DOMAgent.Node} payload
   */
  _setDocument(payload) {
    this._idToDOMNode = {};
    if (payload && 'nodeId' in payload)
      this._document = new WebInspector.DOMDocument(this, payload);
    else
      this._document = null;
    this.dispatchEventToListeners(WebInspector.DOMModel.Events.DocumentUpdated, this._document);
  }

  /**
   * @param {!DOMAgent.Node} payload
   */
  _setDetachedRoot(payload) {
    if (payload.nodeName === '#document')
      new WebInspector.DOMDocument(this, payload);
    else
      WebInspector.DOMNode.create(this, null, false, payload);
  }

  /**
   * @param {!DOMAgent.NodeId} parentId
   * @param {!Array.<!DOMAgent.Node>} payloads
   */
  _setChildNodes(parentId, payloads) {
    if (!parentId && payloads.length) {
      this._setDetachedRoot(payloads[0]);
      return;
    }

    var parent = this._idToDOMNode[parentId];
    parent._setChildrenPayload(payloads);
  }

  /**
   * @param {!DOMAgent.NodeId} nodeId
   * @param {number} newValue
   */
  _childNodeCountUpdated(nodeId, newValue) {
    var node = this._idToDOMNode[nodeId];
    node._childNodeCount = newValue;
    this.dispatchEventToListeners(WebInspector.DOMModel.Events.ChildNodeCountUpdated, node);
    this._scheduleMutationEvent(node);
  }

  /**
   * @param {!DOMAgent.NodeId} parentId
   * @param {!DOMAgent.NodeId} prevId
   * @param {!DOMAgent.Node} payload
   */
  _childNodeInserted(parentId, prevId, payload) {
    var parent = this._idToDOMNode[parentId];
    var prev = this._idToDOMNode[prevId];
    var node = parent._insertChild(prev, payload);
    this._idToDOMNode[node.id] = node;
    this.dispatchEventToListeners(WebInspector.DOMModel.Events.NodeInserted, node);
    this._scheduleMutationEvent(node);
  }

  /**
   * @param {!DOMAgent.NodeId} parentId
   * @param {!DOMAgent.NodeId} nodeId
   */
  _childNodeRemoved(parentId, nodeId) {
    var parent = this._idToDOMNode[parentId];
    var node = this._idToDOMNode[nodeId];
    parent._removeChild(node);
    this._unbind(node);
    this.dispatchEventToListeners(WebInspector.DOMModel.Events.NodeRemoved, {node: node, parent: parent});
    this._scheduleMutationEvent(node);
  }

  /**
   * @param {!DOMAgent.NodeId} hostId
   * @param {!DOMAgent.Node} root
   */
  _shadowRootPushed(hostId, root) {
    var host = this._idToDOMNode[hostId];
    if (!host)
      return;
    var node = WebInspector.DOMNode.create(this, host.ownerDocument, true, root);
    node.parentNode = host;
    this._idToDOMNode[node.id] = node;
    host._shadowRoots.unshift(node);
    this.dispatchEventToListeners(WebInspector.DOMModel.Events.NodeInserted, node);
    this._scheduleMutationEvent(node);
  }

  /**
   * @param {!DOMAgent.NodeId} hostId
   * @param {!DOMAgent.NodeId} rootId
   */
  _shadowRootPopped(hostId, rootId) {
    var host = this._idToDOMNode[hostId];
    if (!host)
      return;
    var root = this._idToDOMNode[rootId];
    if (!root)
      return;
    host._removeChild(root);
    this._unbind(root);
    this.dispatchEventToListeners(WebInspector.DOMModel.Events.NodeRemoved, {node: root, parent: host});
    this._scheduleMutationEvent(root);
  }

  /**
   * @param {!DOMAgent.NodeId} parentId
   * @param {!DOMAgent.Node} pseudoElement
   */
  _pseudoElementAdded(parentId, pseudoElement) {
    var parent = this._idToDOMNode[parentId];
    if (!parent)
      return;
    var node = WebInspector.DOMNode.create(this, parent.ownerDocument, false, pseudoElement);
    node.parentNode = parent;
    this._idToDOMNode[node.id] = node;
    console.assert(!parent._pseudoElements.get(node.pseudoType()));
    parent._pseudoElements.set(node.pseudoType(), node);
    this.dispatchEventToListeners(WebInspector.DOMModel.Events.NodeInserted, node);
    this._scheduleMutationEvent(node);
  }

  /**
   * @param {!DOMAgent.NodeId} parentId
   * @param {!DOMAgent.NodeId} pseudoElementId
   */
  _pseudoElementRemoved(parentId, pseudoElementId) {
    var parent = this._idToDOMNode[parentId];
    if (!parent)
      return;
    var pseudoElement = this._idToDOMNode[pseudoElementId];
    if (!pseudoElement)
      return;
    parent._removeChild(pseudoElement);
    this._unbind(pseudoElement);
    this.dispatchEventToListeners(WebInspector.DOMModel.Events.NodeRemoved, {node: pseudoElement, parent: parent});
    this._scheduleMutationEvent(pseudoElement);
  }

  /**
   * @param {!DOMAgent.NodeId} insertionPointId
   * @param {!Array.<!DOMAgent.BackendNode>} distributedNodes
   */
  _distributedNodesUpdated(insertionPointId, distributedNodes) {
    var insertionPoint = this._idToDOMNode[insertionPointId];
    if (!insertionPoint)
      return;
    insertionPoint._setDistributedNodePayloads(distributedNodes);
    this.dispatchEventToListeners(WebInspector.DOMModel.Events.DistributedNodesChanged, insertionPoint);
    this._scheduleMutationEvent(insertionPoint);
  }

  /**
   * @param {!WebInspector.DOMNode} node
   */
  _unbind(node) {
    delete this._idToDOMNode[node.id];
    for (var i = 0; node._children && i < node._children.length; ++i)
      this._unbind(node._children[i]);
    for (var i = 0; i < node._shadowRoots.length; ++i)
      this._unbind(node._shadowRoots[i]);
    var pseudoElements = node.pseudoElements();
    for (var value of pseudoElements.values())
      this._unbind(value);
    if (node._templateContent)
      this._unbind(node._templateContent);
  }

  /**
   * @param {!DOMAgent.BackendNodeId} backendNodeId
   */
  _inspectNodeRequested(backendNodeId) {
    var deferredNode = new WebInspector.DeferredDOMNode(this.target(), backendNodeId);
    this.dispatchEventToListeners(WebInspector.DOMModel.Events.NodeInspected, deferredNode);
  }

  /**
   * @param {string} query
   * @param {boolean} includeUserAgentShadowDOM
   * @param {function(number)} searchCallback
   */
  performSearch(query, includeUserAgentShadowDOM, searchCallback) {
    WebInspector.DOMModel.cancelSearch();

    /**
     * @param {?Protocol.Error} error
     * @param {string} searchId
     * @param {number} resultsCount
     * @this {WebInspector.DOMModel}
     */
    function callback(error, searchId, resultsCount) {
      this._searchId = searchId;
      searchCallback(resultsCount);
    }
    this._agent.performSearch(query, includeUserAgentShadowDOM, callback.bind(this));
  }

  /**
   * @param {string} query
   * @param {boolean} includeUserAgentShadowDOM
   * @return {!Promise.<number>}
   */
  performSearchPromise(query, includeUserAgentShadowDOM) {
    return new Promise(performSearch.bind(this));

    /**
     * @param {function(number)} resolve
     * @this {WebInspector.DOMModel}
     */
    function performSearch(resolve) {
      this._agent.performSearch(query, includeUserAgentShadowDOM, callback.bind(this));

      /**
       * @param {?Protocol.Error} error
       * @param {string} searchId
       * @param {number} resultsCount
       * @this {WebInspector.DOMModel}
       */
      function callback(error, searchId, resultsCount) {
        if (!error)
          this._searchId = searchId;
        resolve(error ? 0 : resultsCount);
      }
    }
  }

  /**
   * @param {number} index
   * @param {?function(?WebInspector.DOMNode)} callback
   */
  searchResult(index, callback) {
    if (this._searchId)
      this._agent.getSearchResults(this._searchId, index, index + 1, searchResultsCallback.bind(this));
    else
      callback(null);

    /**
     * @param {?Protocol.Error} error
     * @param {!Array.<number>} nodeIds
     * @this {WebInspector.DOMModel}
     */
    function searchResultsCallback(error, nodeIds) {
      if (error) {
        console.error(error);
        callback(null);
        return;
      }
      if (nodeIds.length !== 1)
        return;

      callback(this.nodeForId(nodeIds[0]));
    }
  }

  _cancelSearch() {
    if (this._searchId) {
      this._agent.discardSearchResults(this._searchId);
      delete this._searchId;
    }
  }

  /**
   * @param {!DOMAgent.NodeId} nodeId
   * @return {!Promise<!Array<string>>}
   */
  classNamesPromise(nodeId) {
    return new Promise(promiseBody.bind(this));

    /**
     * @param {function(!Array<string>)} fulfill
     * @this {WebInspector.DOMModel}
     */
    function promiseBody(fulfill) {
      this._agent.collectClassNamesFromSubtree(nodeId, classNamesCallback);

      /**
       * @param {?string} error
       * @param {?Array<string>} classNames
       */
      function classNamesCallback(error, classNames) {
        if (!error && classNames)
          fulfill(classNames);
        else
          fulfill([]);
      }
    }
  }

  /**
   * @param {!DOMAgent.NodeId} nodeId
   * @param {string} selectors
   * @param {function(?DOMAgent.NodeId)=} callback
   */
  querySelector(nodeId, selectors, callback) {
    this._agent.querySelector(nodeId, selectors, this._wrapClientCallback(callback));
  }

  /**
   * @param {!DOMAgent.NodeId} nodeId
   * @param {string} selectors
   * @param {function(!Array.<!DOMAgent.NodeId>=)=} callback
   */
  querySelectorAll(nodeId, selectors, callback) {
    this._agent.querySelectorAll(nodeId, selectors, this._wrapClientCallback(callback));
  }

  /**
   * @param {!DOMAgent.NodeId=} nodeId
   * @param {string=} mode
   * @param {!DOMAgent.BackendNodeId=} backendNodeId
   * @param {!RuntimeAgent.RemoteObjectId=} objectId
   */
  highlightDOMNode(nodeId, mode, backendNodeId, objectId) {
    this.highlightDOMNodeWithConfig(nodeId, {mode: mode}, backendNodeId, objectId);
  }

  /**
   * @param {!DOMAgent.NodeId=} nodeId
   * @param {!{mode: (string|undefined), showInfo: (boolean|undefined), selectors: (string|undefined)}=} config
   * @param {!DOMAgent.BackendNodeId=} backendNodeId
   * @param {!RuntimeAgent.RemoteObjectId=} objectId
   */
  highlightDOMNodeWithConfig(nodeId, config, backendNodeId, objectId) {
    if (WebInspector.DOMModel._highlightDisabled)
      return;
    config = config || {mode: 'all', showInfo: undefined, selectors: undefined};
    if (this._hideDOMNodeHighlightTimeout) {
      clearTimeout(this._hideDOMNodeHighlightTimeout);
      delete this._hideDOMNodeHighlightTimeout;
    }
    var highlightConfig = this._buildHighlightConfig(config.mode);
    if (typeof config.showInfo !== 'undefined')
      highlightConfig.showInfo = config.showInfo;
    if (typeof config.selectors !== 'undefined')
      highlightConfig.selectorList = config.selectors;
    this._highlighter.highlightDOMNode(this.nodeForId(nodeId || 0), highlightConfig, backendNodeId, objectId);
  }

  /**
   * @param {!DOMAgent.NodeId} nodeId
   */
  highlightDOMNodeForTwoSeconds(nodeId) {
    this.highlightDOMNode(nodeId);
    this._hideDOMNodeHighlightTimeout =
        setTimeout(WebInspector.DOMModel.hideDOMNodeHighlight.bind(WebInspector.DOMModel), 2000);
  }

  /**
   * @param {!PageAgent.FrameId} frameId
   */
  highlightFrame(frameId) {
    if (WebInspector.DOMModel._highlightDisabled)
      return;
    this._highlighter.highlightFrame(frameId);
  }

  /**
   * @param {!DOMAgent.InspectMode} mode
   * @param {function(?Protocol.Error)=} callback
   */
  setInspectMode(mode, callback) {
    /**
     * @this {WebInspector.DOMModel}
     */
    function onDocumentAvailable() {
      this._inspectModeEnabled = mode !== DOMAgent.InspectMode.None;
      this.dispatchEventToListeners(WebInspector.DOMModel.Events.InspectModeWillBeToggled, this._inspectModeEnabled);
      this._highlighter.setInspectMode(mode, this._buildHighlightConfig(), callback);
    }
    this.requestDocument(onDocumentAvailable.bind(this));
  }

  /**
   * @return {boolean}
   */
  inspectModeEnabled() {
    return this._inspectModeEnabled;
  }

  /**
   * @param {string=} mode
   * @return {!DOMAgent.HighlightConfig}
   */
  _buildHighlightConfig(mode) {
    mode = mode || 'all';
    var showRulers = WebInspector.moduleSetting('showMetricsRulers').get();
    var highlightConfig = {showInfo: mode === 'all', showRulers: showRulers, showExtensionLines: showRulers};
    if (mode === 'all' || mode === 'content')
      highlightConfig.contentColor = WebInspector.Color.PageHighlight.Content.toProtocolRGBA();

    if (mode === 'all' || mode === 'padding')
      highlightConfig.paddingColor = WebInspector.Color.PageHighlight.Padding.toProtocolRGBA();

    if (mode === 'all' || mode === 'border')
      highlightConfig.borderColor = WebInspector.Color.PageHighlight.Border.toProtocolRGBA();

    if (mode === 'all' || mode === 'margin')
      highlightConfig.marginColor = WebInspector.Color.PageHighlight.Margin.toProtocolRGBA();

    if (mode === 'all') {
      highlightConfig.eventTargetColor = WebInspector.Color.PageHighlight.EventTarget.toProtocolRGBA();
      highlightConfig.shapeColor = WebInspector.Color.PageHighlight.Shape.toProtocolRGBA();
      highlightConfig.shapeMarginColor = WebInspector.Color.PageHighlight.ShapeMargin.toProtocolRGBA();
      highlightConfig.displayAsMaterial = Runtime.experiments.isEnabled('inspectTooltip');
    }
    return highlightConfig;
  }

  /**
   * @param {!WebInspector.DOMNode} node
   * @param {function(?Protocol.Error, ...)=} callback
   * @return {function(...)}
   * @template T
   */
  _markRevision(node, callback) {
    /**
     * @param {?Protocol.Error} error
     * @this {WebInspector.DOMModel}
     */
    function wrapperFunction(error) {
      if (!error)
        this.markUndoableState();

      if (callback)
        callback.apply(this, arguments);
    }
    return wrapperFunction.bind(this);
  }

  markUndoableState() {
    this._agent.markUndoableState();
  }

  /**
   * @param {function(?Protocol.Error)=} callback
   */
  undo(callback) {
    /**
     * @param {?Protocol.Error} error
     * @this {WebInspector.DOMModel}
     */
    function mycallback(error) {
      this.dispatchEventToListeners(WebInspector.DOMModel.Events.UndoRedoCompleted);
      callback(error);
    }

    this.dispatchEventToListeners(WebInspector.DOMModel.Events.UndoRedoRequested);
    this._agent.undo(callback);
  }

  /**
   * @param {function(?Protocol.Error)=} callback
   */
  redo(callback) {
    /**
     * @param {?Protocol.Error} error
     * @this {WebInspector.DOMModel}
     */
    function mycallback(error) {
      this.dispatchEventToListeners(WebInspector.DOMModel.Events.UndoRedoCompleted);
      callback(error);
    }

    this.dispatchEventToListeners(WebInspector.DOMModel.Events.UndoRedoRequested);
    this._agent.redo(callback);
  }

  /**
   * @param {?WebInspector.DOMNodeHighlighter} highlighter
   */
  setHighlighter(highlighter) {
    this._highlighter = highlighter || this._defaultHighlighter;
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {function(?WebInspector.DOMNode)} callback
   */
  nodeForLocation(x, y, callback) {
    this._agent.getNodeForLocation(x, y, mycallback.bind(this));

    /**
     * @param {?Protocol.Error} error
     * @param {number} nodeId
     * @this {WebInspector.DOMModel}
     */
    function mycallback(error, nodeId) {
      if (error) {
        callback(null);
        return;
      }
      callback(this.nodeForId(nodeId));
    }
  }

  /**
   * @param {!WebInspector.RemoteObject} object
   * @param {function(?WebInspector.DOMNode)} callback
   */
  pushObjectAsNodeToFrontend(object, callback) {
    if (object.isNode())
      this.pushNodeToFrontend(object.objectId, callback);
    else
      callback(null);
  }

  /**
   * @override
   * @return {!Promise}
   */
  suspendModel() {
    return new Promise(promiseBody.bind(this));

    /**
     * @param {function()} fulfill
     * @this {WebInspector.DOMModel}
     */
    function promiseBody(fulfill) {
      this._agent.disable(callback.bind(this));

      /**
       * @this {WebInspector.DOMModel}
       */
      function callback() {
        this._setDocument(null);
        fulfill();
      }
    }
  }

  /**
   * @override
   * @return {!Promise}
   */
  resumeModel() {
    return new Promise(promiseBody.bind(this));

    /**
     * @param {function()} fulfill
     * @this {WebInspector.DOMModel}
     */
    function promiseBody(fulfill) {
      this._agent.enable(fulfill);
    }
  }

  /**
   * @param {!DOMAgent.NodeId} nodeId
   */
  nodeHighlightRequested(nodeId) {
    var node = this.nodeForId(nodeId);
    if (!node)
      return;

    this.dispatchEventToListeners(WebInspector.DOMModel.Events.NodeHighlightedInOverlay, node);
  }
};

/** @enum {symbol} */
WebInspector.DOMModel.Events = {
  AttrModified: Symbol('AttrModified'),
  AttrRemoved: Symbol('AttrRemoved'),
  CharacterDataModified: Symbol('CharacterDataModified'),
  DOMMutated: Symbol('DOMMutated'),
  NodeInserted: Symbol('NodeInserted'),
  NodeInspected: Symbol('NodeInspected'),
  NodeHighlightedInOverlay: Symbol('NodeHighlightedInOverlay'),
  NodeRemoved: Symbol('NodeRemoved'),
  DocumentUpdated: Symbol('DocumentUpdated'),
  ChildNodeCountUpdated: Symbol('ChildNodeCountUpdated'),
  UndoRedoRequested: Symbol('UndoRedoRequested'),
  UndoRedoCompleted: Symbol('UndoRedoCompleted'),
  DistributedNodesChanged: Symbol('DistributedNodesChanged'),
  ModelSuspended: Symbol('ModelSuspended'),
  InspectModeWillBeToggled: Symbol('InspectModeWillBeToggled'),
  MarkersChanged: Symbol('MarkersChanged')
};


/**
 * @implements {DOMAgent.Dispatcher}
 * @unrestricted
 */
WebInspector.DOMDispatcher = class {
  /**
   * @param {!WebInspector.DOMModel} domModel
   */
  constructor(domModel) {
    this._domModel = domModel;
  }

  /**
   * @override
   */
  documentUpdated() {
    this._domModel._documentUpdated();
  }

  /**
   * @override
   * @param {!DOMAgent.NodeId} nodeId
   */
  inspectNodeRequested(nodeId) {
    this._domModel._inspectNodeRequested(nodeId);
  }

  /**
   * @override
   * @param {!DOMAgent.NodeId} nodeId
   * @param {string} name
   * @param {string} value
   */
  attributeModified(nodeId, name, value) {
    this._domModel._attributeModified(nodeId, name, value);
  }

  /**
   * @override
   * @param {!DOMAgent.NodeId} nodeId
   * @param {string} name
   */
  attributeRemoved(nodeId, name) {
    this._domModel._attributeRemoved(nodeId, name);
  }

  /**
   * @override
   * @param {!Array.<!DOMAgent.NodeId>} nodeIds
   */
  inlineStyleInvalidated(nodeIds) {
    this._domModel._inlineStyleInvalidated(nodeIds);
  }

  /**
   * @override
   * @param {!DOMAgent.NodeId} nodeId
   * @param {string} characterData
   */
  characterDataModified(nodeId, characterData) {
    this._domModel._characterDataModified(nodeId, characterData);
  }

  /**
   * @override
   * @param {!DOMAgent.NodeId} parentId
   * @param {!Array.<!DOMAgent.Node>} payloads
   */
  setChildNodes(parentId, payloads) {
    this._domModel._setChildNodes(parentId, payloads);
  }

  /**
   * @override
   * @param {!DOMAgent.NodeId} nodeId
   * @param {number} childNodeCount
   */
  childNodeCountUpdated(nodeId, childNodeCount) {
    this._domModel._childNodeCountUpdated(nodeId, childNodeCount);
  }

  /**
   * @override
   * @param {!DOMAgent.NodeId} parentNodeId
   * @param {!DOMAgent.NodeId} previousNodeId
   * @param {!DOMAgent.Node} payload
   */
  childNodeInserted(parentNodeId, previousNodeId, payload) {
    this._domModel._childNodeInserted(parentNodeId, previousNodeId, payload);
  }

  /**
   * @override
   * @param {!DOMAgent.NodeId} parentNodeId
   * @param {!DOMAgent.NodeId} nodeId
   */
  childNodeRemoved(parentNodeId, nodeId) {
    this._domModel._childNodeRemoved(parentNodeId, nodeId);
  }

  /**
   * @override
   * @param {!DOMAgent.NodeId} hostId
   * @param {!DOMAgent.Node} root
   */
  shadowRootPushed(hostId, root) {
    this._domModel._shadowRootPushed(hostId, root);
  }

  /**
   * @override
   * @param {!DOMAgent.NodeId} hostId
   * @param {!DOMAgent.NodeId} rootId
   */
  shadowRootPopped(hostId, rootId) {
    this._domModel._shadowRootPopped(hostId, rootId);
  }

  /**
   * @override
   * @param {!DOMAgent.NodeId} parentId
   * @param {!DOMAgent.Node} pseudoElement
   */
  pseudoElementAdded(parentId, pseudoElement) {
    this._domModel._pseudoElementAdded(parentId, pseudoElement);
  }

  /**
   * @override
   * @param {!DOMAgent.NodeId} parentId
   * @param {!DOMAgent.NodeId} pseudoElementId
   */
  pseudoElementRemoved(parentId, pseudoElementId) {
    this._domModel._pseudoElementRemoved(parentId, pseudoElementId);
  }

  /**
   * @override
   * @param {!DOMAgent.NodeId} insertionPointId
   * @param {!Array.<!DOMAgent.BackendNode>} distributedNodes
   */
  distributedNodesUpdated(insertionPointId, distributedNodes) {
    this._domModel._distributedNodesUpdated(insertionPointId, distributedNodes);
  }

  /**
   * @override
   * @param {!DOMAgent.NodeId} nodeId
   */
  nodeHighlightRequested(nodeId) {
    this._domModel.nodeHighlightRequested(nodeId);
  }
};

/**
 * @interface
 */
WebInspector.DOMNodeHighlighter = function() {};

WebInspector.DOMNodeHighlighter.prototype = {
  /**
   * @param {?WebInspector.DOMNode} node
   * @param {!DOMAgent.HighlightConfig} config
   * @param {!DOMAgent.BackendNodeId=} backendNodeId
   * @param {!RuntimeAgent.RemoteObjectId=} objectId
   */
  highlightDOMNode: function(node, config, backendNodeId, objectId) {},

  /**
   * @param {!DOMAgent.InspectMode} mode
   * @param {!DOMAgent.HighlightConfig} config
   * @param {function(?Protocol.Error)=} callback
   */
  setInspectMode: function(mode, config, callback) {},

  /**
   * @param {!PageAgent.FrameId} frameId
   */
  highlightFrame: function(frameId) {}
};

/**
 * @implements {WebInspector.DOMNodeHighlighter}
 * @unrestricted
 */
WebInspector.DefaultDOMNodeHighlighter = class {
  /**
   * @param {!Protocol.DOMAgent} agent
   */
  constructor(agent) {
    this._agent = agent;
  }

  /**
   * @override
   * @param {?WebInspector.DOMNode} node
   * @param {!DOMAgent.HighlightConfig} config
   * @param {!DOMAgent.BackendNodeId=} backendNodeId
   * @param {!RuntimeAgent.RemoteObjectId=} objectId
   */
  highlightDOMNode(node, config, backendNodeId, objectId) {
    if (objectId || node || backendNodeId)
      this._agent.highlightNode(config, (objectId || backendNodeId) ? undefined : node.id, backendNodeId, objectId);
    else
      this._agent.hideHighlight();
  }

  /**
   * @override
   * @param {!DOMAgent.InspectMode} mode
   * @param {!DOMAgent.HighlightConfig} config
   * @param {function(?Protocol.Error)=} callback
   */
  setInspectMode(mode, config, callback) {
    this._agent.setInspectMode(mode, config, callback);
  }

  /**
   * @override
   * @param {!PageAgent.FrameId} frameId
   */
  highlightFrame(frameId) {
    this._agent.highlightFrame(
        frameId, WebInspector.Color.PageHighlight.Content.toProtocolRGBA(),
        WebInspector.Color.PageHighlight.ContentOutline.toProtocolRGBA());
  }
};
