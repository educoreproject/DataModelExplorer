'use strict';
// Aggregator for UseCase-family schema manifests. Consumers call getSchemaByLabel(label)
// to retrieve the manifest for a specific node type. The mapper and access-point use the
// root `useCase` manifest to drive property allow-lists, strict validation, and child
// traversal.

const useCase          = require('./useCaseSchema');
const useCaseStep      = require('./useCaseStepSchema');
const useCaseActor     = require('./useCaseActorSchema');
const dataReference    = require('./dataReferenceSchema');
const externalReference = require('./externalReferenceSchema');

const byLabel = {
	UseCase:            useCase,
	UseCaseStep:        useCaseStep,
	UseCaseActor:       useCaseActor,
	DataReference:      dataReference,
	ExternalReference:  externalReference
};

const bySchemaKey = {
	useCase,
	useCaseStep,
	useCaseActor,
	dataReference,
	externalReference
};

const getSchemaByLabel = (label) => byLabel[label];
const getSchemaByKey   = (key)   => bySchemaKey[key];

module.exports = {
	useCase,
	useCaseStep,
	useCaseActor,
	dataReference,
	externalReference,
	getSchemaByLabel,
	getSchemaByKey
};
