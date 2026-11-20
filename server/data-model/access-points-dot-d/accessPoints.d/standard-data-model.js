#!/usr/bin/env node
'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[Neo4jAbstraction]]
// @concept: [[AccessPointPattern]]

// standard-data-model — the Standards Explorer's data model map (BD 2026-11-17), drawn by the SERVER from the graph as the use
// case map is. Input { focusStableId }: the node the explorer's walk is on. Answers one of:
//   { mapKind: 'standard', focusStableId, standard, svgText, width, height, summary }  a standard's main classes as entity tables and
//        the properties joining them (render-data-model-diagram chooses them): the focus is a standard's root, or a family (or
//        release) holding exactly one standard. The use-case standard (standardKind useCaseCorpus, no classes) answers this kind
//        too: its kinds of node (UseCase, UserStory, Actor ...) as the tables, the relationships between them as the lines
//   { mapKind: 'class', focusStableId, standard, focusClass, svgText, width, height, summary }  one class and its neighbours: the
//        focus is a class, or a property (its owning class, the property marked)
//   { mapKind: 'standardTooLarge', focusStableId, standard, classCount, linkCount }  a standard too large to draw whole
//        (render-data-model-diagram's limits, in the mapper); the explorer offers a class's map instead
//   { mapKind: 'chooseStandard', focusStableId, standardList }  a family or release holding several standards
//   { mapKind: 'none', focusStableId }  a node with no data model of its own (the families catalog, a hub card, a value)
// Runs on the golden READ-ONLY handle. Refuses by name: an absent focusStableId, and a graph lacking a required label.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const { pipeRunner, taskListPlus } = new require('qtools-asynchronous-pipe-plus')();
const { makeRequiredLabelProbe } = require('../../lib/required-label-probe');
const { renderStandardDataModel, renderUseCaseModel, renderClassDataModel } = require('../../lib/data-model-diagram/render-data-model-diagram');

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD, passThroughParameters }) {
	const { neo4jDb, dataMapping } = passThroughParameters;
	const mapper = dataMapping[moduleName];

	const probeRequiredLabels = makeRequiredLabelProbe({
		neo4jDb,
		ownerName: moduleName,
		requiredLabelList: mapper.requiredLabelList,
		absentReason: 'this graph holds no standards with classes and properties',
	});

	// runs one named query; a failure names the query
	const runNamedQuery = (queryName, queryParams, callback) => {
		const queryBundle = mapper.getCypher(queryName, queryParams);
		neo4jDb.runQuery(queryBundle.cypher, queryBundle.params, (queryError, recordList) => {
			if (queryError) {
				callback(`${moduleName}: ${queryName} failed: ${queryError}`);
				return;
			}
			callback('', recordList);
		});
	};

	// ================================================================================
	// THE MAPS

	const drawWithin = (drawName, drawFunction, callback) => {
		let diagram;
		try {
			diagram = drawFunction();
		} catch (renderError) {
			callback(`${moduleName}: could not draw ${drawName}: ${renderError.message}`);
			return;
		}
		callback('', diagram);
	};

	// a whole standard, when it is small enough to read as one picture
	const readStandardMap = ({ focusStableId, source }, callback) => {
		runNamedQuery('standardOfSource', { source }, (standardError, standardRecordList) => {
			if (standardError) {
				callback(standardError);
				return;
			}
			if (!standardRecordList.length) {
				callback('', { mapKind: 'none', focusStableId });
				return;
			}
			const { classCount, ...standard } = standardRecordList[0];
			if (mapper.isStandardKindUseCase(standard)) {
				readUseCaseModelMap({ focusStableId, source, standard }, callback);
				return;
			}
			const classTotal = mapper.numberOf(classCount);
			if (classTotal > mapper.WHOLE_MAP_CLASS_LIMIT) {
				callback('', { mapKind: 'standardTooLarge', focusStableId, standard, classCount: classTotal, linkCount: null });
				return;
			}
			runNamedQuery('standardLinkCount', { source }, (countError, countRecordList) => {
				if (countError) {
					callback(countError);
					return;
				}
				const linkTotal = mapper.numberOf(countRecordList[0] && countRecordList[0].linkCount);
				if (linkTotal > mapper.WHOLE_MAP_LINK_LIMIT) {
					callback('', { mapKind: 'standardTooLarge', focusStableId, standard, classCount: classTotal, linkCount: linkTotal });
					return;
				}
				runNamedQuery('standardClassList', { source }, (classError, classRecordList) => {
					if (classError) {
						callback(classError);
						return;
					}
					runNamedQuery('standardPropertyList', { source }, (propertyError, propertyList) => {
						if (propertyError) {
							callback(propertyError);
							return;
						}
						drawWithin(source, () => renderStandardDataModel({ standard, classList: mapper.mapClassRecordList(classRecordList), propertyList }), (drawError, diagram) =>
							callback(drawError, drawError ? undefined : { mapKind: 'standard', focusStableId, standard, ...diagram }),
						);
					});
				});
			});
		});
	};

	// the use-case standard: the kinds of node it holds and the relationships between them
	const readUseCaseModelMap = ({ focusStableId, source, standard }, callback) => {
		runNamedQuery('useCaseKindList', { source }, (kindError, kindRecordList) => {
			if (kindError) {
				callback(kindError);
				return;
			}
			runNamedQuery('useCaseKeyList', { source }, (keyError, keyRecordList) => {
				if (keyError) {
					callback(keyError);
					return;
				}
				runNamedQuery('useCaseRelationshipList', { source }, (relationshipError, relationshipRecordList) => {
					if (relationshipError) {
						callback(relationshipError);
						return;
					}
					const useCaseModel = mapper.mapUseCaseModel({ kindRecordList, keyRecordList, relationshipRecordList });
					drawWithin(source, () => renderUseCaseModel({ standard, ...useCaseModel }), (drawError, diagram) =>
						callback(drawError, drawError ? undefined : { mapKind: 'standard', focusStableId, standard, ...diagram }),
					);
				});
			});
		});
	};

	// one class and its neighbours (for a property: its owning class, the property marked)
	const readClassMap = ({ focusStableId, classStableId, highlightPropertyName }, callback) => {
		runNamedQuery('classOfStableId', { classStableId }, (classError, classRecordList) => {
			if (classError) {
				callback(classError);
				return;
			}
			if (!classRecordList.length) {
				callback('', { mapKind: 'none', focusStableId });
				return;
			}
			const focusClass = classRecordList[0];
			runNamedQuery('standardOfSource', { source: focusClass.source }, (standardError, standardRecordList) => {
				if (standardError) {
					callback(standardError);
					return;
				}
				const standard = standardRecordList.length ? (({ classCount, ...standardFields }) => standardFields)(standardRecordList[0]) : null;
				runNamedQuery('classPropertyList', { classStableId }, (propertyError, propertyList) => {
					if (propertyError) {
						callback(propertyError);
						return;
					}
					runNamedQuery('classNeighbourList', { classStableId }, (neighbourError, neighbourRecordList) => {
						if (neighbourError) {
							callback(neighbourError);
							return;
						}
						const neighbourList = mapper.mapNeighbourRecordList(neighbourRecordList, focusClass.source);
						drawWithin(classStableId, () => renderClassDataModel({ standard, focusClass, propertyList, neighbourList, highlightPropertyName }), (drawError, diagram) =>
							callback(drawError, drawError ? undefined : { mapKind: 'class', focusStableId, standard, focusClass, ...diagram }),
						);
					});
				});
			});
		});
	};

	// a family or release: its one standard's map, or the standards to choose among
	const readFamilyMap = ({ focusStableId, familyAndRelease }, callback) => {
		runNamedQuery('standardListOfFamily', familyAndRelease, (listError, standardList) => {
			if (listError) {
				callback(listError);
				return;
			}
			if (standardList.length === 1) {
				readStandardMap({ focusStableId, source: standardList[0].source }, callback);
				return;
			}
			callback('', standardList.length ? { mapKind: 'chooseStandard', focusStableId, standardList } : { mapKind: 'none', focusStableId });
		});
	};

	// what the focus is decides the map
	const readDataModelMap = ({ focusStableId }, callback) => {
		const familyAndRelease = mapper.familyOfSyntheticId(focusStableId);
		if (familyAndRelease) {
			readFamilyMap({ focusStableId, familyAndRelease }, callback);
			return;
		}
		runNamedQuery('focusNode', { focusStableId }, (focusError, focusRecordList) => {
			if (focusError) {
				callback(focusError);
				return;
			}
			const focusNode = focusRecordList[0];
			if (!focusNode) {
				callback('', { mapKind: 'none', focusStableId });
				return;
			}
			if (focusNode.isStandardRoot) {
				readStandardMap({ focusStableId, source: focusNode.source }, callback);
				return;
			}
			if (focusNode.role === 'DmeClass') {
				readClassMap({ focusStableId, classStableId: focusNode.stableId }, callback);
				return;
			}
			if (focusNode.ownerClassStableId) {
				readClassMap({ focusStableId, classStableId: focusNode.ownerClassStableId, highlightPropertyName: focusNode.name }, callback);
				return;
			}
			callback('', { mapKind: 'none', focusStableId });
		});
	};

	// ================================================================================
	// SERVICE FUNCTION

	const serviceFunction = (xQuery, callback) => {
		const taskList = new taskListPlus();

		// STAGE 1: the focus is REQUIRED, a stableId as the explorer's walk names it
		taskList.push((args, next) => {
			const focusStableId = args.xQuery.focusStableId;
			if (typeof focusStableId !== 'string' || focusStableId.trim() === '') {
				next(`${moduleName}: focusStableId is required as a non-empty string (received ${JSON.stringify(focusStableId)})`, args);
				return;
			}
			next('', { ...args, focusStableId: focusStableId.trim() });
		});

		// STAGE 2: the graph must hold standards with classes and properties
		taskList.push((args, next) => probeRequiredLabels((probeError) => next(probeError, args)));

		// STAGE 3: the map
		taskList.push((args, next) => readDataModelMap({ focusStableId: args.focusStableId }, (mapError, mapResult) => next(mapError, { ...args, mapResult })));

		pipeRunner(taskList.getList(), { xQuery: xQuery || {} }, (pipeError, args) => {
			if (pipeError) {
				callback(pipeError);
				return;
			}
			callback('', args.mapResult);
		});
	};

	// ================================================================================
	// ACCESS POINT REGISTRATION

	dotD.logList.push(moduleName);
	dotD.library.add(moduleName, serviceFunction);

	return {};
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction;
