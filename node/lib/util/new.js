/*
 * Copyright (c) 2017, Two Sigma Open Source
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * * Redistributions of source code must retain the above copyright notice,
 *   this list of conditions and the following disclaimer.
 *
 * * Redistributions in binary form must reproduce the above copyright notice,
 *   this list of conditions and the following disclaimer in the documentation
 *   and/or other materials provided with the distribution.
 *
 * * Neither the name of git-meta nor the names of its
 *   contributors may be used to endorse or promote products derived from
 *   this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 */
"use strict";

const assert    = require("chai").assert;
const co        = require("co");
const colors    = require("colors");
const fs        = require("fs-promise");
const NodeGit   = require("nodegit");
const path      = require("path");

const GitUtil             = require("./git_util");
const SubmoduleConfigUtil = require("./submodule_config_util");
const UserError           = require("./user_error");

/**
 * Create a new (empty) submodule at the specified `filename` in the specified
 * `repo`.  If the specified `importArg` is provided, import from the specified
 * `importArg.url` and checkout HEAD to the specified `importArg.branch`.
 *
 * @param {NodeGit.Repository} repo
 * @param {Object | null}      importArg
 * @param {String}             importArg.url
 * @param {String}             importArg.branch
 * @param {String}             filename
 */
exports.newSubmodule = co.wrap(function *(repo, filename, importArg) {
    assert.instanceOf(repo, NodeGit.Repository);
    assert.isString(filename);
    if (null !== importArg) {
        assert.isObject(importArg);
        assert.isString(importArg.url);
        assert.isString(importArg.branch);
    }
    const modulesPath = path.join(repo.workdir(),
                                  SubmoduleConfigUtil.modulesFileName);
    fs.appendFileSync(modulesPath, `\
[submodule "${filename}"]
    path = ${filename}
    url = .
`);
    const index = yield repo.index();
    yield index.addByPath(SubmoduleConfigUtil.modulesFileName);
    yield index.write();
    const metaUrl = yield GitUtil.getOriginUrl(repo);
    const subRepo = yield SubmoduleConfigUtil.initSubmoduleAndRepo(metaUrl,
                                                                repo,
                                                                filename,
                                                                ".");
    if (null === importArg) {
        return subRepo;                                               // RETURN
    }

    yield NodeGit.Remote.create(subRepo, "upstream", importArg.url);
    yield GitUtil.fetch(subRepo, "upstream");
    const remoteBranch = yield GitUtil.findRemoteBranch(subRepo,
                                                        "upstream",
                                                        importArg.branch);
    if (null === remoteBranch) {
        throw new UserError(`
The requested branch: ${colors.red(importArg.ranch)} does not exist.`);
    }
    const commit = yield subRepo.getCommit(remoteBranch.target());
    yield GitUtil.setHeadHard(subRepo, commit);
});
